/**
 * Redirecționare browser la Netopia (flux certificate mobilPay):
 * POST la rădăcina domeniului cu env_key, data, iv, cipher.
 * Nu folosiți URL-uri de tip /payment?... pe mobilpay.ro – dau „Invalid controller specified (payment)”.
 */

export type NetopiaCertificatePayload = {
  form_url: string;
  env_key: string;
  data: string;
  iv?: string;
  cipher?: string;
};

export function submitNetopiaCertificateForm(payload: NetopiaCertificatePayload): boolean {
  const { form_url, env_key, data, iv = '', cipher = 'aes-256-cbc' } = payload;
  if (!form_url || !env_key || !data) return false;

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = form_url;

  const add = (name: string, value: string) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };

  add('env_key', env_key);
  add('data', data);
  add('iv', iv);
  add('cipher', cipher);

  document.body.appendChild(form);
  form.submit();
  return true;
}
