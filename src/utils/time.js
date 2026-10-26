/**
 * Định dạng số phút thành chuỗi "X giờ Y phút" hoặc "X phút"
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatMinutes(totalMinutes = 0) {
  if (totalMinutes < 60) {
    return `${totalMinutes} phút`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} giờ ${minutes} phút`;
}
