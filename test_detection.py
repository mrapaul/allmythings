import requests
import json
import time
import os

image_path = "test_images/ai_interior.jpg"
det_url = "http://127.0.0.1:8001/detect"
api_url = "http://localhost:3000/v1/detect"

def test_service(name, url, files, headers=None):
    print(f"\n--- Testing {name} ({url}) ---")
    try:
        # Reset file pointer
        files['file'].seek(0)
        start = time.time()
        response = requests.post(url, files=files, data={"confidence": 0.05}, headers=headers)
        duration = time.time() - start
        
        if response.status_code == 200:
            print(f"Success! ({duration:.2f}s)")
            data = response.json()
            # Pretty print simplified structure
            if 'detections' in data:
                print(f"Found {len(data['detections'])} objects:")
                for d in data['detections'][:5]: # Show first 5
                    label = d.get('label')
                    cat = d.get('category', '')
                    conf = d.get('confidence')
                    print(f" - {label} [{cat}] ({conf:.2f})")
                if len(data['detections']) > 5:
                    print(f"   ... and {len(data['detections']) - 5} more")
            else:
                print("No detections field found.")
                print(str(data)[:200])
            return data
        else:
            print(f"Error: {response.status_code}")
            print(response.text[:200])
    except Exception as e:
        print(f"Failed to connect: {e}")
    return None

if __name__ == "__main__":
    if not os.path.exists(image_path):
        print(f"Image not found: {image_path}")
        exit(1)

    with open(image_path, "rb") as f:
        # 1. Test Direct Detection Service
        det_result = test_service("Detection Service (YOLO/RT-DETR)", det_url, {"file": f})
        
    # Re-open for second request
    with open(image_path, "rb") as f:
        # 2. Test API Service (Gemini/Ollama)
        # Use simple token for auth
        headers = {"Authorization": "Bearer test-user"}
        api_result = test_service("API Service (Ensemble)", api_url, {"file": f}, headers=headers)