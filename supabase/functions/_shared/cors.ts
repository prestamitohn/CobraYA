// CORS compartido por todas las Edge Functions. Sin esto, el navegador bloquea la
// respuesta antes de que llegue al JS de la app (falla silenciosa: "Failed to send a
// request to the Edge Function") aunque la función responda 200 perfecto — probado
// desde curl/Node (que no aplican CORS) no lo detecta, solo se ve desde el navegador.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
