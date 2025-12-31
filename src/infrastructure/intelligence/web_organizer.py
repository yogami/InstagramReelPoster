import sys
import json
import logging
import contextlib
import os
from transformers import pipeline

# Configure logging
logging.basicConfig(stream=sys.stderr, level=logging.INFO)
logger = logging.getLogger("WebOrganizer")

@contextlib.contextmanager
def suppress_stdout():
    """Redirects stdout to stderr to keep stdout clean for JSON output."""
    original_stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        yield
    finally:
        sys.stdout = original_stdout

def classify_site(text):
    """
    Classifies website text using WebOrganizer models.
    """
    with suppress_stdout():
        try:
            # Load SOTA Classifiers (WebOrganizer arXiv:2502.10341)
            try:
                topic_clf = pipeline("text-classification", model="WebOrganizer/TopicClassifier", trust_remote_code=True)
                format_clf = pipeline("text-classification", model="WebOrganizer/FormatClassifier", trust_remote_code=True)
                
                # Predict
                topic_res = topic_clf(text[:512]) 
                format_res = format_clf(text[:512])
                
                return {
                    "topic": topic_res[0]['label'],
                    "format": format_res[0]['label'],
                    "confidence": topic_res[0]['score']
                }
            except Exception as e:
                logger.warning(f"WebOrganizer models not found (simulation mode): {e}")
                logger.info("Falling back to Zero-Shot Classification...")
                
                # Fallback
                classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
                
                topics = ["Science & Technology", "Finance/Business", "Home/Hobbies", "Health/Medicine", "Arts/Entertainment", "News/Media"]
                formats = ["Landing Page", "Ecommerce Store", "Portfolio", "Local Service", "Blog/News"]
                
                topic_res = classifier(text, topics)
                format_res = classifier(text, formats)
                
                return {
                    "topic": topic_res['labels'][0],
                    "format": format_res['labels'][0],
                    "confidence": topic_res['scores'][0]
                }

        except Exception as e:
            logger.error(f"Classification failed: {e}")
            return {
                "topic": "Unknown",
                "format": "Unknown",
                "error": str(e)
            }

if __name__ == "__main__":
    # Read input from stdin
    try:
        input_data = sys.stdin.read()
        if not input_data:
            raise ValueError("No input data provided")
            
        data = json.loads(input_data)
        main_text = data.get("main_text", "")
        
        if not main_text:
             main_text = f"{data.get('heroText', '')} {data.get('metaDescription', '')}"
        
        result = classify_site(main_text)
        
        # Output JSON to stdout (Clean)
        print(json.dumps(result))
        
    except Exception as e:
        logger.error(f"Main execution failed: {e}")
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
