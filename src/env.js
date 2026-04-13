// iPadOS 13+ Safari 伪装为 Mac UA，需用 maxTouchPoints 辅助识别
const _isIPadOS = navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent);
const _params = new URLSearchParams(window.location.search);
// URL 参数 ?mobile=1 强制移动端模式
const _forceMobile = _params.get('mobile') === '1';
// URL 参数 ?ipad=1 iPad/平板模式（Mobile 布局 + PC 缩放）
const _forcePad = _params.get('ipad') === '1';
export const isPad = _forcePad;
export const isMobile = _forcePad || _forceMobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || _isIPadOS;
export const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || _isIPadOS;

if (_forcePad) {
  document.documentElement.classList.add('pad-mode');
}
if (isMobile && isIOS && !_forcePad) {
  document.documentElement.classList.add('mobile-ios');
}
