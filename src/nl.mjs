// Optional natural-language front end. The model only turns free text into a structured request;
// matching, pricing and ranking stay deterministic. Any OpenAI-compatible endpoint works (DeepSeek, Kimi, GLM).

const SYSTEM = `你把用户关于麦当劳点餐的一句话，转换成结构化 JSON。只输出 JSON，不要解释。
格式：{"items":[{"name":"餐品名","qty":1}],"city":"城市或null","near":"地标或null"}
规则：
- name 用麦当劳菜单上的常见叫法，保留用户说的规格（中/大/小杯、几块）。没说的规格不要编。
- 只提取用户明确想吃的东西，不推荐、不添加、不替换。
- 套餐名照抄（例如"麦辣鸡腿汉堡三件套"）。
- 没提到城市/地标就填 null。`;

export async function parseNaturalLanguage(text, {
  apiKey = process.env.DEEPSEEK_API_KEY,
  baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com',
  model = process.env.DEEPSEEK_MODEL || 'deepseek-flash',
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw Object.assign(new Error('自然语言模式需要 DEEPSEEK_API_KEY（或直接用「麦辣鸡腿堡 中薯 中可乐」这种写法，不需要任何模型）'), { code: 'NO_LLM_KEY' });
  const res = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }],
    }),
  });
  if (!res.ok) throw new Error(`模型接口返回 ${res.status}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const items = (parsed.items || []).filter((i) => i && i.name).map((i) => ({ name: String(i.name), qty: Math.max(1, parseInt(i.qty, 10) || 1) }));
  return {
    request: items.map((i) => (i.qty > 1 ? `${i.name}x${i.qty}` : i.name)).join(' '),
    city: parsed.city || undefined,
    near: parsed.near || undefined,
  };
}
