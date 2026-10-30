export async function discordApi(path, accessToken) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'Phiên Discord đã hết hạn. Hãy đăng nhập lại.' : 'Discord đang bận. Hãy thử lại sau.');
    error.status = response.status === 401 ? 401 : 502;
    error.httpStatus = response.status;
    throw error;
  }
  return response.json();
}
