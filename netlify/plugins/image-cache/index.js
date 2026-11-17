// Keeps the smaller image copies (public/images/_w, made by scripts/responsive-images.mjs during
// `npm run build`) in Netlify's build cache, so each deploy only makes copies of new photos.
// Uses only Netlify's built-in cache utilities: no service, no cost. A cache miss just means a
// slower build (about 30 s more), never a failed one.
const DIR = 'public/images/_w';

export const onPreBuild = async ({ utils }) => {
  const ok = await utils.cache.restore(DIR);
  console.log(ok ? `image-cache: restored ${DIR}` : 'image-cache: nothing cached yet');
};

export const onPostBuild = async ({ utils }) => {
  const ok = await utils.cache.save(DIR);
  console.log(ok ? `image-cache: saved ${DIR}` : `image-cache: ${DIR} not saved`);
};
