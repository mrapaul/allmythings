import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "vlm_lora"))

from fetch_bootstrap import HF_SETS, _to_xywh, image_file_name
from train_mlx import convert_jsonl


def test_image_file_name_is_unique_across_splits():
    # HF image_id restarts per split; a split-less name silently overwrote
    # train images with validation/test ones (235 corrupted entries observed).
    names = {
        image_file_name("Francesco/furniture-ngpea", split, 1)
        for split in ("train", "validation", "test")
    }
    assert len(names) == 3
    assert names == {
        "furniture-ngpea-train-1.jpg",
        "furniture-ngpea-validation-1.jpg",
        "furniture-ngpea-test-1.jpg",
    }


def test_to_xywh_passthrough_and_conversion():
    assert _to_xywh([10, 20, 30, 40], "xywh") == [10.0, 20.0, 30.0, 40.0]
    assert _to_xywh([10, 20, 110, 220], "xyxy") == [10.0, 20.0, 100.0, 200.0]
    assert _to_xywh([10, 20, 5, 10], "xyxy") == [10.0, 20.0, 0.0, 0.0]


def test_hf_sets_declare_verified_bbox_formats():
    assert HF_SETS["coco-household"]["bbox_format"] == "xyxy"
    assert HF_SETS["furniture-hf"]["bbox_format"] == "xywh"


def test_convert_jsonl_to_mlx_format(tmp_path):
    swift_rec = {
        "messages": [
            {"role": "user", "content": "<image>Find every object."},
            {"role": "assistant", "content": '{"items": []}'},
        ],
        "images": ["/x/a.jpg"],
    }
    src = tmp_path / "train.jsonl"
    src.write_text(json.dumps(swift_rec) + "\n" + json.dumps(swift_rec) + "\n", encoding="utf-8")

    count = convert_jsonl(src, tmp_path / "mlx", limit=1)

    assert count == 1
    out = [
        json.loads(line)
        for line in (tmp_path / "mlx" / "train.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert len(out) == 1
    rec = out[0]
    assert rec["images"] == ["/x/a.jpg"]
    user, assistant = rec["messages"]
    assert user["content"][0] == {"type": "image"}
    assert user["content"][1] == {"type": "text", "text": "Find every object."}
    assert assistant["content"][0]["text"] == '{"items": []}'
