// This landing page needs no session. Remove implicit-flow credentials from
// browser history without storing them or sending them anywhere.
const params = new URLSearchParams(location.hash.slice(1));
const failed = params.has('error') || params.has('error_code');
if (location.hash) history.replaceState(null, '', location.pathname);
if (failed) document.getElementById('confirmation-copy').textContent = 'تعذّر تأكيد هذا الرابط. عد إلى تطبيق نصفين واطلب رسالة تفعيل جديدة.';
