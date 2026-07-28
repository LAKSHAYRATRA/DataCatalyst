#!/bin/bash
AWS_REGION="us-east-1"
ACCOUNT_ID="<YOUR_AWS_ACCOUNT_ID>"
REP_NAME="voclara-audio-qc"

# Authenticate Docker to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Create ECR repo if missing
aws ecr create-repository --repository-name $REP_NAME --region $AWS_REGION || true

# Build
docker build -t $REP_NAME .

# Tag & Push
docker tag $REP_NAME:latest $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REP_NAME:latest
docker push $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REP_NAME:latest
