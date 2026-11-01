// Claude-powered features: extension search assistant and food photo analysis.
// Without ANTHROPIC_API_KEY the search falls back to keyword matching and photo analysis is off.
import Anthropic from '@anthropic-ai/sdk';
import { EXTENSIONS, getExtension } from '../src/shared/extensions.js';

export const AI_MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export function createAiClient(env) {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

export const REFUSAL_TEXT =
  '죄송해요, 저는 체단실 앱과 익스텐션에 관한 질문에만 답할 수 있어요. 원하는 운동 방식이나 기록하고 싶은 것을 알려주시면 맞는 익스텐션을 찾아드릴게요.';

const CATALOG = EXTENSIONS.map((e) => `- id: ${e.id} | ${e.name} | ${e.short} | ${e.description}`).join('\n');

const SEARCH_SYSTEM = `당신은 운동 기록 앱 "체단실"의 익스텐션 검색 도우미입니다.
사용자가 원하는 기능이나 운동 방식을 말하면, 아래 목록에서 알맞은 익스텐션을 골라 짧게(1~2문장) 한국어 존댓말로 안내하세요.
답변 문장에는 익스텐션 이름을 넣고, 추천한 익스텐션의 id를 extension_ids에 넣으세요. 앱이 그 id를 익스텐션 화면 링크로 바꿔 보여줍니다.
목록에 없는 익스텐션을 지어내지 마세요. 맞는 것이 없으면 솔직히 없다고 말하고 extension_ids는 비워 두세요.
체단실 앱, 운동, 익스텐션과 관계없는 질문(일반 상식, 코딩, 잡담 등)에는 정중하게 거절하고 off_topic을 true로, extension_ids는 비워 두세요.

익스텐션 목록:
${CATALOG}`;

const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    extension_ids: { type: 'array', items: { type: 'string', enum: EXTENSIONS.map((e) => e.id) } },
    off_topic: { type: 'boolean' },
  },
  required: ['answer', 'extension_ids', 'off_topic'],
  additionalProperties: false,
};

function firstText(message) {
  const block = message.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}

async function askJson(client, { system, content, schema, maxTokens = 2000 }) {
  const message = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  });
  if (message.stop_reason === 'refusal') return { refused: true };
  try {
    return { data: JSON.parse(firstText(message)) };
  } catch {
    return { refused: true };
  }
}

// ---- keyword fallback ----
const TOPIC_WORDS = [
  '운동', '헬스', '근력', '근육', '루틴', '프로그램', '세트', '반복', '무게', '증량', '몸무게', '체중', '칼로리',
  '식단', '다이어트', '벌크', '익스텐션', '기록', '스쿼트', '벤치', '데드', '단백질', '영양', '감량', '체단실',
];

export function keywordSearch(question) {
  const q = String(question).toLowerCase().replace(/\s+/g, '');
  const onTopic = TOPIC_WORDS.some((w) => q.includes(w));
  const scored = EXTENSIONS.map((e) => {
    const terms = [e.name, e.id, ...(e.keywords || [])].map((t) => t.toLowerCase().replace(/\s+/g, ''));
    // Latin/number terms (5x5, gvt, hst...) are distinctive; plain Korean words only count on fitness questions.
    const hits = terms.filter((t) => t.length >= 2 && q.includes(t) && (onTopic || /[0-9a-z]/.test(t)));
    return { e, score: hits.reduce((s, t) => s + t.length, 0) };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) {
    if (!onTopic) return { answer: REFUSAL_TEXT, extensionIds: [], offTopic: true, source: 'keyword' };
    return {
      answer: '질문에 딱 맞는 익스텐션을 찾지 못했어요. 운동 프로그램(5x5, GVT, HST)이나 몸무게·칼로리 기록처럼 원하는 기능을 알려주세요.',
      extensionIds: [],
      offTopic: false,
      source: 'keyword',
    };
  }
  const top = scored.filter((x) => x.score >= scored[0].score / 2).slice(0, 3).map((x) => x.e);
  const names = top.map((e) => e.name).join(', ');
  return {
    answer: `${names} 익스텐션을 추천해요. 아래 링크에서 자세히 보고 적용할 수 있어요.`,
    extensionIds: top.map((e) => e.id),
    offTopic: false,
    source: 'keyword',
  };
}

export async function searchExtensionsAi(client, question) {
  if (!client) return keywordSearch(question);
  const { data, refused } = await askJson(client, { system: SEARCH_SYSTEM, content: question, schema: SEARCH_SCHEMA });
  if (refused || !data) return { answer: REFUSAL_TEXT, extensionIds: [], offTopic: true, source: 'ai' };
  const ids = [...new Set(data.extension_ids || [])].filter((id) => getExtension(id));
  return {
    answer: String(data.answer || '').slice(0, 600),
    extensionIds: data.off_topic ? [] : ids,
    offTopic: Boolean(data.off_topic),
    source: 'ai',
  };
}

// ---- food photo ----
const FOOD_SYSTEM = `당신은 음식 사진을 보고 영양 정보를 추정하는 도우미입니다.
사진에 보이는 음식마다 한국어 이름과 1인분 기준(사진에 보이는 양) 칼로리(kcal), 탄수화물·단백질·지방(g)을 추정하세요.
음식이 아니거나 알아볼 수 없으면 items를 비우고 note에 이유를 짧게 쓰세요.`;

const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kcal: { type: 'number' },
          carbs: { type: 'number' },
          protein: { type: 'number' },
          fat: { type: 'number' },
        },
        required: ['name', 'kcal', 'carbs', 'protein', 'fat'],
        additionalProperties: false,
      },
    },
    note: { type: 'string' },
  },
  required: ['items', 'note'],
  additionalProperties: false,
};

export async function analyzeFoodPhoto(client, { data, mediaType }) {
  const { data: out, refused } = await askJson(client, {
    system: FOOD_SYSTEM,
    schema: FOOD_SCHEMA,
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
      { type: 'text', text: '이 음식의 영양 정보를 추정해 주세요.' },
    ],
  });
  if (refused || !out) return { items: [], note: '사진을 분석하지 못했어요. 직접 입력해 주세요.' };
  const clean = (n) => Math.max(0, Math.round(Number(n) || 0));
  return {
    items: (out.items || []).slice(0, 10).map((i) => ({
      name: String(i.name).slice(0, 40),
      kcal: clean(i.kcal),
      carbs: clean(i.carbs),
      protein: clean(i.protein),
      fat: clean(i.fat),
    })),
    note: String(out.note || ''),
  };
}
