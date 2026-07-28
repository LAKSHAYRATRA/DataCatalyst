# AWS Lambda Audio QC Service Deployment Guide

This guide details how to build and deploy the unified audio QC container to AWS Lambda.

---

## 1. Prerequisites
Ensure you have the following installed and configured on your machine:
1. **Docker Desktop** (running and set to Linux containers).
2. **AWS CLI** (v2) configured with administrator credentials:
   ```bash
   aws configure
   ```

---

## 2. Setup Folder Contents
Inside this setup package you have:
* `lambda_function.py`: The Lambda request handler orchestrator.
* `freq2.py`: Audio signal metrics & spectrogram generator.
* `yamnet_noise_analyzer_v4.py`: Parallel tensorflow noise analyzer.
* `yamnet_class_map.csv`: Display names database for YAMNet classes.
* `Dockerfile`: AWS Lambda Base python container setup.
* `requirements.txt`: Python package requirements.
* `deploy_lambda.sh`: Linux/macOS build shell script.

---

## 3. Step-by-Step Deployment Instructions

### Step 3.1: Log in Docker to AWS ECR
Authenticate Docker with your AWS account repository:
```bash
aws ecr get-login-password --region <YOUR_AWS_REGION> | docker login --username AWS --password-stdin <YOUR_AWS_ACCOUNT_ID>.dkr.ecr.<YOUR_AWS_REGION>.amazonaws.com
```

### Step 3.2: Create ECR Repository (If not already created)
Create a repository named `voclara-audio-qc` in ECR:
```bash
aws ecr create-repository --repository-name voclara-audio-qc --region <YOUR_AWS_REGION>
```

### Step 3.3: Build Container Image
Run the docker build command inside this directory. This bakes YAMNet model weights directly into ECR to eliminate runtime download delays:
```bash
docker build -t voclara-audio-qc .
```

### Step 3.4: Tag and Push Image to ECR
Tag your built image and push it to AWS:
```bash
docker tag voclara-audio-qc:latest <YOUR_AWS_ACCOUNT_ID>.dkr.ecr.<YOUR_AWS_REGION>.amazonaws.com/voclara-audio-qc:latest
docker push <YOUR_AWS_ACCOUNT_ID>.dkr.ecr.<YOUR_AWS_REGION>.amazonaws.com/voclara-audio-qc:latest
```

---

## 4. Lambda Function Configuration

In the AWS Console under Lambda:
1. Click **Create function** and select **Container image**.
2. Set **Function name** to `voclara-audio-qc`.
3. Choose the container image from ECR you pushed in step 3.4.
4. Under **Configuration -> General configuration**:
   * **Memory**: **`1536 MB`** (minimum 1.5GB to ensure fast Python multi-threading and adequate CPU allocation).
   * **Timeout**: **`30 seconds`** (to handle processing long conversational files).
5. Under **Configuration -> Permissions**:
   * Ensure the execution role has policies allowing `s3:GetObject` and `s3:PutObject` for your recordings S3 bucket.

---

## 5. Testing the Lambda Function

Once deployed, create a test event with the following JSON structure:

```json
{
  "bucket": "your-voicechat-recordings-bucket-name",
  "key": "recordings/calls/sample_audio.wav",
  "output_prefix": "qc_plots/",
  "skip_yamnet": false
}
```

If successful, the function returns a `200` status with the following structure:
```json
{
  "statusCode": 200,
  "body": {
    "yamnet": {
      "suspicion_rating": 0,
      "rating_label": "Clean",
      "top_noise_events": "None",
      "events": []
    },
    "freq": {
      "noise_floor": -48.2,
      "crest_factor": 12.4,
      "bit_depth": "24-bit",
      "processing_verdict": "clean",
      "spectrogram_s3_key": "qc_plots/sample_audio_freq.png"
    },
    "analyzedAt": "us-east-1"
  }
}
```
