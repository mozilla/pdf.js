let cache = new Map();

export async function getProfilePictureURL(userId) {
  let existing = cache.get(userId);
  if (existing != null) {
    return existing
  } else {
    let url = generateDataURL(userId);
    cache.set(userId, url);
    return url;
  }
}

async function generateDataURL(userId) {
  let originalUrl = window.scholarlyUsers?.get(userId)?.profilePicture
    ?? 'images/default-user.png';
  let blob = await fetch(originalUrl, {
    referrer: "no-referrer"
  }).then(r => r.blob())
  return await new Promise(resolve => {
    let reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
