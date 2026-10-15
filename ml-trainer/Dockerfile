FROM pytorch/pytorch:2.4.0-cuda12.1-cudnn9-devel
WORKDIR /app
RUN pip install --no-cache-dir "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git" \
    trl peft accelerate bitsandbytes datasets pillow psycopg2-binary requests
COPY continuous_lora_worker.py .
CMD ["python3", "continuous_lora_worker.py"]
