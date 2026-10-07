// Endereço do site para links (redefinição de senha, e-mails montados na
// tela, links copiados). Nos domínios de produção é sempre o endereço
// oficial, como antes; em staging/preview é o próprio endereço aberto, para
// um teste nunca mandar ninguém para a produção (28/09).
export const PROD_SITE  = 'https://elos.eqpitech.com.br'
export const PROD_HOSTS = ['elos.eqpitech.com.br', 'sigec-elos.netlify.app']

export const isProdHost = () =>
  typeof window === 'undefined' || PROD_HOSTS.includes(window.location.hostname)

export const siteUrl = () => (isProdHost() ? PROD_SITE : window.location.origin)
