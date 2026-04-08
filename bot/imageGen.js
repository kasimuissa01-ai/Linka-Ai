export async function generatePhotoshoot(originalImageUrl, photoshootPrompt) {
    const finalPrompt = `A professional commercial photoshoot, ${photoshootPrompt}. The product must look exactly like the one in this reference image: ${originalImageUrl}. high-end photography, sharp focus, 8k, highly detailed textures, masterpiece.`;
    const encodedPrompt = encodeURIComponent(finalPrompt);
    const seed = Math.floor(Math.random() * 1000000);
    
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
}