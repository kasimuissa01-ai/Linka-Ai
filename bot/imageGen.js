export async function generatePhotoshoot(originalImageUrl, photoshootPrompt) {
    // We add specific quality tokens to the end of every prompt
    const qualityBoost = "commercial graphic design, high-quality typography, sharp text rendering, 8k, masterpiece, fashion photography";
    
    // If an image is provided, we tell the AI to use it as a reference
    const reference = originalImageUrl ? `Inspired by the style and item in this image: ${originalImageUrl}.` : "";
    
    const finalPrompt = encodeURIComponent(`${reference} ${photoshootPrompt}, ${qualityBoost}`);
    const seed = Math.floor(Math.random() * 1000000);
    
    // We use the image subdomain for direct JPG delivery
    return `https://image.pollinations.ai/prompt/${finalPrompt}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
}