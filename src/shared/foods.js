// Built-in food catalog (per serving). Shared by client and server (no imports).
// Values are typical estimates; kcal ≈ 4·carbs + 4·protein + 9·fat (fiber/alcohol cause small gaps).
export const FOODS = [
  // 주식
  { id: 'rice', name: '흰쌀밥', serving: '1공기 (210g)', kcal: 313, carbs: 69, protein: 6, fat: 1 },
  { id: 'brown_rice', name: '현미밥', serving: '1공기 (210g)', kcal: 310, carbs: 66, protein: 6.5, fat: 2.3 },
  { id: 'multigrain_rice', name: '잡곡밥', serving: '1공기 (210g)', kcal: 310, carbs: 67, protein: 7, fat: 1.5 },
  { id: 'sweet_potato', name: '고구마', serving: '1개 (150g)', kcal: 195, carbs: 46, protein: 2, fat: 0.3 },
  { id: 'potato', name: '감자', serving: '1개 (150g)', kcal: 105, carbs: 24, protein: 2.5, fat: 0.1 },
  { id: 'oatmeal', name: '오트밀', serving: '50g', kcal: 190, carbs: 33, protein: 6.5, fat: 3.5 },
  { id: 'bread', name: '식빵', serving: '1장 (35g)', kcal: 95, carbs: 17, protein: 3, fat: 1.5 },
  { id: 'banana', name: '바나나', serving: '1개 (120g)', kcal: 105, carbs: 27, protein: 1.3, fat: 0.4 },
  { id: 'apple', name: '사과', serving: '1개 (200g)', kcal: 105, carbs: 28, protein: 0.5, fat: 0.3 },
  { id: 'cherry_tomato', name: '방울토마토', serving: '10개 (150g)', kcal: 28, carbs: 6, protein: 1.3, fat: 0.3 },

  // 한식·외식
  { id: 'kimchi_jjigae', name: '김치찌개', serving: '1인분 (400g)', kcal: 280, carbs: 12, protein: 17, fat: 18 },
  { id: 'doenjang_jjigae', name: '된장찌개', serving: '1인분 (400g)', kcal: 150, carbs: 12, protein: 11, fat: 6 },
  { id: 'sundubu_jjigae', name: '순두부찌개', serving: '1인분 (400g)', kcal: 260, carbs: 12, protein: 17, fat: 16 },
  { id: 'bibimbap', name: '비빔밥', serving: '1그릇 (450g)', kcal: 600, carbs: 95, protein: 20, fat: 15 },
  { id: 'jeyuk', name: '제육볶음', serving: '1인분 (200g)', kcal: 440, carbs: 18, protein: 28, fat: 28 },
  { id: 'bulgogi', name: '소불고기', serving: '1인분 (200g)', kcal: 390, carbs: 18, protein: 30, fat: 22 },
  { id: 'samgyeopsal', name: '삼겹살 구이', serving: '1인분 (200g)', kcal: 650, carbs: 0, protein: 34, fat: 57 },
  { id: 'kimbap', name: '김밥', serving: '1줄 (230g)', kcal: 480, carbs: 72, protein: 14, fat: 15 },
  { id: 'samgak_kimbap', name: '삼각김밥', serving: '1개 (110g)', kcal: 200, carbs: 38, protein: 5, fat: 3.5 },
  { id: 'ramyeon', name: '라면', serving: '1봉지 (120g)', kcal: 500, carbs: 79, protein: 10, fat: 16 },
  { id: 'cup_ramyeon', name: '컵라면 (소)', serving: '1개 (65g)', kcal: 290, carbs: 40, protein: 6, fat: 12 },
  { id: 'tteokbokki', name: '떡볶이', serving: '1인분 (300g)', kcal: 480, carbs: 95, protein: 10, fat: 6 },
  { id: 'jjajangmyeon', name: '짜장면', serving: '1그릇 (650g)', kcal: 790, carbs: 120, protein: 22, fat: 25 },
  { id: 'fried_chicken', name: '후라이드 치킨', serving: '1/4마리 (250g)', kcal: 590, carbs: 22, protein: 40, fat: 38 },
  { id: 'donkatsu', name: '돈가스', serving: '1인분 (200g)', kcal: 660, carbs: 50, protein: 30, fat: 38 },
  { id: 'kimchi', name: '배추김치', serving: '1접시 (50g)', kcal: 15, carbs: 2.4, protein: 0.8, fat: 0.3 },
  { id: 'salad', name: '채소 샐러드 (드레싱 포함)', serving: '1접시 (150g)', kcal: 150, carbs: 10, protein: 3, fat: 11 },

  // 단백질·헬스 식품
  { id: 'chicken_breast', name: '닭가슴살', serving: '100g (익힌 것)', kcal: 160, carbs: 0, protein: 31, fat: 3.6 },
  { id: 'egg', name: '계란', serving: '1개 (50g)', kcal: 72, carbs: 0.4, protein: 6.3, fat: 4.8 },
  { id: 'egg_white', name: '삶은 달걀 흰자', serving: '1개분 (33g)', kcal: 17, carbs: 0.2, protein: 3.6, fat: 0.1 },
  { id: 'protein_shake', name: '프로틴 쉐이크', serving: '1스쿱 (30g, 물)', kcal: 120, carbs: 3, protein: 24, fat: 1.5 },
  { id: 'protein_bar', name: '프로틴 바', serving: '1개 (60g)', kcal: 205, carbs: 20, protein: 15, fat: 7 },
  { id: 'greek_yogurt', name: '그릭요거트 (무가당)', serving: '100g', kcal: 97, carbs: 4, protein: 9, fat: 5 },
  { id: 'milk', name: '우유', serving: '200ml', kcal: 130, carbs: 9.6, protein: 6.4, fat: 7.4 },
  { id: 'almonds', name: '아몬드', serving: '한 줌 (25g)', kcal: 150, carbs: 5.4, protein: 5.3, fat: 12.5 },
  { id: 'peanut_butter', name: '땅콩버터', serving: '1큰술 (16g)', kcal: 95, carbs: 3.2, protein: 3.6, fat: 8 },
  { id: 'tofu', name: '두부', serving: '반 모 (150g)', kcal: 126, carbs: 3, protein: 13, fat: 7 },
  { id: 'salmon', name: '연어', serving: '100g', kcal: 200, carbs: 0, protein: 20, fat: 13 },
  { id: 'beef_round', name: '소고기 우둔', serving: '100g', kcal: 135, carbs: 0, protein: 22, fat: 5 },
  { id: 'tuna_can', name: '참치 통조림 (기름 뺀 것)', serving: '1캔 (100g)', kcal: 130, carbs: 0, protein: 25, fat: 3 },

  // 음료·간식
  { id: 'americano', name: '아메리카노', serving: '1잔 (355ml)', kcal: 10, carbs: 1.5, protein: 0.5, fat: 0 },
  { id: 'latte', name: '카페라떼', serving: '1잔 (355ml)', kcal: 180, carbs: 14, protein: 10, fat: 9 },
  { id: 'orange_juice', name: '오렌지 주스', serving: '200ml', kcal: 90, carbs: 21, protein: 1.4, fat: 0.2 },
  { id: 'cola', name: '콜라', serving: '1캔 (355ml)', kcal: 150, carbs: 38, protein: 0, fat: 0 },
  { id: 'beer', name: '맥주', serving: '500ml', kcal: 210, carbs: 16, protein: 2, fat: 0 },
  { id: 'potato_chips', name: '감자칩', serving: '1봉 (60g)', kcal: 330, carbs: 33, protein: 3.5, fat: 21 },
  { id: 'choco_pie', name: '초코파이', serving: '1개 (39g)', kcal: 170, carbs: 24, protein: 1.8, fat: 7.5 },
];

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');

// Case- and whitespace-insensitive substring match on the name (and id).
// Name-prefix matches come first. An empty query returns the whole list.
export function searchFoods(query) {
  const q = norm(query);
  if (!q) return FOODS.slice();
  const hits = FOODS.filter((f) => norm(f.name).includes(q) || norm(f.id).includes(q));
  const starts = (f) => (norm(f.name).startsWith(q) ? 0 : 1);
  return hits.sort((a, b) => starts(a) - starts(b));
}
