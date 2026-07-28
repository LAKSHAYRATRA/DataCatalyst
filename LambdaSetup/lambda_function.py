import os
import sys
import json
import boto3
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Disable TensorFlow GPU checking and warnings
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
# Point TensorFlow Hub to the baked model directory in the container
os.environ['TFHUB_CACHE_DIR'] = '/var/task/tfhub_modules'

# Force matplotlib to use headless backend
import matplotlib
matplotlib.use('Agg')

# Import analysis logic
from freq2 import analyze_file as run_freq_analysis, plot_freq_curve
from yamnet_noise_analyzer_v4 import load_yamnet, load_class_names, analyze_file as run_yamnet_analysis

s3_client = boto3.client('s3')

# Pre-load YAMNet model at Lambda initialization (warm container speedup)
YAMNET_MODEL, TF = load_yamnet()
YAMNET_CLASS_NAMES = load_class_names()

def lambda_handler(event, context):
    """
    AWS Lambda entry point.
    Expects event payload format:
    {
        "bucket": "voicechat-recordings",
        "key": "recordings/calls/test_call.flac",
        "output_prefix": "qc_plots/",
        "skip_yamnet": false
    }
    """
    try:
        bucket = event.get("bucket")
        key = event.get("key")
        output_prefix = event.get("output_prefix", "qc_plots/")
        skip_yamnet = event.get("skip_yamnet", False)
        
        if not bucket or not key:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing 'bucket' or 'key' parameter."})
            }
            
        filename = Path(key).name
        local_input_path = f"/tmp/{filename}"
        
        # 1. Download file from S3
        print(f"Downloading s3://{bucket}/{key} to {local_input_path}...")
        s3_client.download_file(bucket, key, local_input_path)
        
        freq_result = None
        yamnet_result = {
            "suspicion_rating": 0,
            "rating_label": "Clean (YAMNet bypassed - configuration)",
            "top_noise_events": "None",
            "events": []
        }
        
        # 2. Run analysis blocks in parallel thread pool
        with ThreadPoolExecutor(max_workers=2) as executor:
            # Spawn Freq2 analysis
            freq_future = executor.submit(run_freq_analysis, local_input_path)
            
            # Spawn YAMNet if not skipped
            yamnet_future = None
            if not skip_yamnet:
                yamnet_future = executor.submit(
                    run_yamnet_analysis, 
                    local_input_path, 
                    YAMNET_MODEL, 
                    TF, 
                    YAMNET_CLASS_NAMES, 
                    threshold=0.20
                )
                
            freq_result = freq_future.result()
            if yamnet_future:
                yamnet_result = yamnet_future.result()

        # 3. Generate Spectrogram Plot
        print("Generating spectrogram plot...")
        plot_path = plot_freq_curve(freq_result, "/tmp", show=False)
        
        # 4. Upload Spectrogram image back to S3
        plot_filename = Path(plot_path).name
        s3_output_key = f"{output_prefix}{plot_filename}"
        print(f"Uploading spectrogram to s3://{bucket}/{s3_output_key}...")
        s3_client.upload_file(plot_path, bucket, s3_output_key, ExtraArgs={'ContentType': 'image/png'})
        
        # 4.5. Read plot image and encode to base64 if requested
        plot_base64 = None
        if event.get("return_base64_plot", False):
            import base64
            try:
                with open(plot_path, "rb") as image_file:
                    plot_base64 = base64.b64encode(image_file.read()).decode("utf-8")
            except Exception as e:
                print(f"[Warning] Failed to base64 encode plot: {e}")
        
        # 5. Clean up local files from /tmp
        try:
            os.remove(local_input_path)
            os.remove(plot_path)
        except Exception as e:
            print(f"[Warning] Failed to clean up temp files: {e}")
            
        # 6. Build unified response payload
        unified_qc = {
            "yamnet": {
                "suspicion_rating": yamnet_result.get("suspicion_rating", 0),
                "rating_label": yamnet_result.get("rating_label", "Clean"),
                "top_noise_events": yamnet_result.get("top_noise_events", "None"),
                "events": yamnet_result.get("events", [])
            },
            "freq": {
                "noise_floor": freq_result.get("noise_floor_db"),
                "noise_floor_db": freq_result.get("noise_floor_db"),
                "crest_factor": freq_result.get("crest_factor"),
                "bit_depth": freq_result.get("bit_verdict"),
                "bit_verdict": freq_result.get("bit_verdict"),
                "processing_verdict": freq_result.get("processing_verdict"),
                "spectrogram_s3_key": s3_output_key,
                "spectrogram_img": plot_base64
            },
            "analyzedAt": boto3.client('lambda').meta.region_name
        }
        
        return {
            "statusCode": 200,
            "body": unified_qc
        }
        
    except Exception as e:
        print(f"[ERROR] Lambda processing failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
