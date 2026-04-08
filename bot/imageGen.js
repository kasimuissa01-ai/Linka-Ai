export async function generatePhotoshoot(originalImageUrl, photoshootPrompt) {
    console.log('[AI Engine] Starting Flux-1 Photoshoot...');

    // We combine the prompt with the reference image URL.
    // Pollinations reads the 'ref' parameter to look at your original photo.
    const baseUrl = "https://pollinations.ai/p/";
    const fullPrompt = encodeURIComponent(`${photoshootPrompt}, matching the product in this image: ${originalImageUrl}`);
    
    // Construct the magic URL
    // We add parameters to ensure high quality and "Studio" aspect ratio
    const aiUrl = `${baseUrl}${fullPrompt}?width=1024&height=1024&model=flux&seed=${Math.floor(Math.random() * 1000000)}`;

    // Note: Pollinations returns the image directly. 
    // We can just return this URL to the frontend!
    return aiUrl;
}