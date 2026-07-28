# Use AWS Lambda base container image for Python
FROM public.ecr.aws/lambda/python:3.11

# Configure tensorflow caching inside task folder
ENV TFHUB_CACHE_DIR=/var/task/tfhub_modules

# Install system dependencies (libsndfile for soundfile)
RUN yum update -y && \
    yum install -y libsndfile && \
    yum clean all

# Copy requirements list
COPY requirements.txt ./

# Install packages
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download and cache YAMNet model inside ECR image layer
RUN python -c "import os; os.environ['TFHUB_CACHE_DIR']='/var/task/tfhub_modules'; import tensorflow_hub as hub; hub.load('https://tfhub.dev/google/yamnet/1')"

# Copy scripts and classification files
COPY freq2.py yamnet_noise_analyzer_v4.py yamnet_class_map.csv lambda_function.py ./

# Set Lambda runtime command
CMD [ "lambda_function.lambda_handler" ]
