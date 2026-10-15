import os
import json
import time
import uuid
import requests
import psycopg2
from PIL import Image
import torch
from datasets import Dataset
from unsloth import FastVisionModel
from trl import SFTTrainer, SFTConfig

DB_DSN = os.environ["DATABASE_URL"]
VLLM_ADMIN_URL = os.environ.get("VLLM_ADMIN_URL", "http://vllm-slm:8000/v1")
BASE_VISION_MODEL = "unsloth/Qwen2.5-VL-3B-Instruct-bnb-4bit"
ADAPTER_OUTPUT_DIR = "/models/adapters"
MIN_NEW_SAMPLES_FOR_TRAINING = int(os.environ.get("MIN_NEW_SAMPLES", "32"))


def fetch_untrained_samples(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, crop_storage_path, rejected_output, chosen_output, is_edited
            FROM slm_training_samples
            WHERE used_in_adapter_id IS NULL
            ORDER BY is_edited DESC, created_at ASC
            LIMIT 512;
            """
        )
        return cur.fetchall()


def format_vision_training_record(crop_path: str, chosen: dict):
    image = Image.open(crop_path).convert("RGB")
    target_json = json.dumps(
        {
            "isBackgroundFixture": False,
            "name": chosen["name"],
            "properties": chosen["properties"],
            "labels": chosen["labels"],
        },
        ensure_ascii=False,
    )
    return {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {
                        "type": "text",
                        "text": "Identify this household possession and extract all specific properties and searchable labels as JSON.",
                    },
                ],
            },
            {
                "role": "assistant",
                "content": [{"type": "text", "text": target_json}],
            },
        ]
    }


def run_incremental_qlora_update(samples):
    adapter_version = f"qwen2.5-vl-3b-inventory-lora-{uuid.uuid4().hex[:8]}"
    save_path = os.path.join(ADAPTER_OUTPUT_DIR, adapter_version)

    model, tokenizer = FastVisionModel.from_pretrained(
        BASE_VISION_MODEL,
        load_in_4bit=True,
        use_gradient_checkpointing="unsloth",
    )

    model = FastVisionModel.get_peft_model(
        model,
        finetune_vision_layers=True,
        finetune_language_layers=True,
        finetune_attention_modules=True,
        finetune_mlp_modules=True,
        r=16,
        lora_alpha=32,
        lora_dropout=0.0,
        bias="none",
    )

    records = [
        format_vision_training_record(row[1], row[3])
        for row in samples
        if os.path.exists(row[1])
    ]
    dataset = Dataset.from_list(records)

    FastVisionModel.for_training(model)
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        args=SFTConfig(
            per_device_train_batch_size=4,
            gradient_accumulation_steps=2,
            warmup_steps=5,
            max_steps=60,
            learning_rate=2e-4,
            fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(),
            logging_steps=10,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="cosine",
            output_dir=save_path,
            remove_unused_columns=False,
            dataset_text_field="",
            dataset_kwargs={"skip_prepare_dataset": True},
        ),
    )

    train_result = trainer.train()
    model.save_pretrained(save_path)
    tokenizer.save_pretrained(save_path)
    return adapter_version, save_path, float(train_result.training_loss)


def hot_swap_vllm_adapter(conn, adapter_name: str, save_path: str, sample_ids: list, train_loss: float):
    resp = requests.post(
        f"{VLLM_ADMIN_URL}/load_lora_adapter",
        json={"lora_name": adapter_name, "lora_path": save_path},
        timeout=30,
    )
    resp.raise_for_status()

    with conn.cursor() as cur:
        cur.execute(
            "UPDATE slm_adapter_versions SET is_active = FALSE WHERE model_stage = 'vision_extractor';"
        )
        cur.execute(
            """
            INSERT INTO slm_adapter_versions 
                (model_stage, adapter_name, adapter_path, training_samples_count, val_loss, is_active)
            VALUES ('vision_extractor', %s, %s, %s, %s, TRUE)
            RETURNING id;
            """,
            (adapter_name, save_path, len(sample_ids), train_loss),
        )
        adapter_id = cur.fetchone()[0]
        cur.execute(
            "UPDATE slm_training_samples SET used_in_adapter_id = %s WHERE id = ANY(%s::uuid[]);",
            (adapter_id, sample_ids),
        )
    conn.commit()


def main():
    os.makedirs(ADAPTER_OUTPUT_DIR, exist_ok=True)
    while True:
        try:
            with psycopg2.connect(DB_DSN) as conn:
                samples = fetch_untrained_samples(conn)
                if len(samples) >= MIN_NEW_SAMPLES_FOR_TRAINING:
                    sample_ids = [str(s[0]) for s in samples]
                    adapter_name, save_path, loss = run_incremental_qlora_update(samples)
                    hot_swap_vllm_adapter(conn, adapter_name, save_path, sample_ids, loss)
        except Exception as exc:
            print(f"[ContinuousLoRAWorker] Error: {exc}", flush=True)
        time.sleep(60)


if __name__ == "__main__":
    main()
