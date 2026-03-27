#!/bin/bash
# Finds the correct Veo 3.1 model name on kie.ai
API_KEY="1f38ff8abd28546722a0cbd80e033fee"
IMG="https://res.cloudinary.com/djol0rpn5/image/upload/v1773703534/remotion_prototypes/beach_full_scene.jpg"

MODELS=(
  "veo/3-1-image-to-video"
  "google/veo-3-1-image-to-video"
  "google-veo-3.1/image-to-video"
  "veo-3.1/image-to-video"
  "veo/3.1-image-to-video"
  "google/veo-3.1"
  "veo/3-1"
  "google-veo/3-1-image-to-video"
  "veo-3-1/image-to-video"
  "google/veo-3-1"
  "veo3.1/image-to-video"
  "veo-3.1/text-to-video"
  "google-veo-3-1/image-to-video"
)

echo "Testing ${#MODELS[@]} model names..."
for model in "${MODELS[@]}"; do
  RESP=$(curl -s --max-time 5 -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"input\":{\"prompt\":\"test\",\"image_url\":\"$IMG\",\"duration\":\"5\"}}")
  CODE=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code','?'))" 2>/dev/null)
  MSG=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('msg','?')[:60])" 2>/dev/null)
  echo "  $model -> $CODE ($MSG)"
  # If not 422, we found something
  if [ "$CODE" != "422" ]; then
    echo ""
    echo "*** FOUND: $model -> $CODE $MSG ***"
    echo "Full response: $RESP"
  fi
done
echo ""
echo "Done. Copy any model with code 200 or 500 (not 422) and share it."
