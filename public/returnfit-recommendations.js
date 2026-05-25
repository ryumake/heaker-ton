window.ReturnFitRecommendations = (() => {
  function readJsonStorage(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  }

  function getProfile() {
    const basicInfo = readJsonStorage("returnfitBasicInfo", {});
    const reentryResult = readJsonStorage("returnfitReentryResult", {});
    const phq9Score = Number(localStorage.getItem("returnfitPhq9Score") || 0);
    const hasPhq9Result = localStorage.getItem("returnfitPhq9Score") !== null;
    return {
      age: basicInfo.age || "",
      region: basicInfo.region || "",
      jobs: basicInfo.jobs || [],
      supports: basicInfo.supports || [],
      readinessScore: Number(reentryResult.readinessScore || 0),
      riskScore: Number(reentryResult.riskScore || 0),
      phq9Score: phq9Score,
      hasBasicInfo: Boolean(basicInfo.age || basicInfo.region || basicInfo.jobs?.length || basicInfo.supports?.length),
      hasReentryResult: Boolean(reentryResult && reentryResult.readinessScore !== undefined),
      hasPhq9Result: hasPhq9Result,
    };
  }

  function expandKeywords(value) {
    const text = String(value || "").toLowerCase();
    const groups = {
      "사무": ["사무", "행정", "총무", "회계", "전산", "엑셀", "컴퓨터활용", "문서"],
      "it/개발": ["it", "개발", "코딩", "프로그래밍", "웹", "앱", "데이터", "sql", "python", "java"],
      "디자인": ["디자인", "포토샵", "일러스트", "그래픽", "ui", "ux", "영상", "콘텐츠"],
      "마케팅": ["마케팅", "홍보", "광고", "sns", "콘텐츠", "브랜딩"],
      "서비스": ["서비스", "고객", "상담", "cs", "매장", "바리스타"],
      "생산/기술": ["생산", "기술", "제조", "기계", "전기", "설비"],
      "사회복지": ["사회복지", "복지", "상담", "돌봄"],
      "교육": ["교육", "강사", "교사", "학습", "훈련"],
    };
    return groups[text] || [text];
  }

  function scoreItem(item, profile, type) {
    const text = [
      item.title,
      item.company,
      item.school,
      item.region,
      item.address,
      item.summary,
      item.target,
      ...(item.tags || []),
    ].join(" ").toLowerCase();

    let score = 0;
    if (profile.region && text.includes(profile.region.toLowerCase())) score += 4;
    (profile.jobs || []).forEach(job => {
      if (expandKeywords(job).some(keyword => text.includes(keyword))) score += 7;
    });
    (profile.supports || []).forEach(support => {
      if (text.includes(String(support).toLowerCase())) score += 3;
    });
    if (profile.hasReentryResult && type === "trainings" && profile.readinessScore < 65) score += 2;
    if (profile.hasReentryResult && type === "jobs" && profile.readinessScore >= 65) score += 2;
    return score;
  }

  function fallbackRecommendations(items, profile, type) {
    const hasSurvey = profile.hasBasicInfo || profile.hasReentryResult;
    const scored = items
      .map((item, index) => ({ index, score: scoreItem(item, profile, type) }))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    const picked = scored; // Return all sorted candidates

    return picked
      .map(item => ({
        index: item.index,
        reason: hasSurvey
          ? "설문 조건과 실제로 맞는 항목이에요."
          : "설문 전 먼저 확인해보기 좋은 항목이에요.",
      }));
  }

  async function recommend(type, items) {
    const profile = getProfile();
    const candidates = items.slice(0, 12);
    if (!candidates.length) return items;

    let recommendations = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch("http://localhost:5607/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ type, profile, items: candidates }),
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
      }
    } catch {
      recommendations = [];
    }

    if (!recommendations.length) {
      recommendations = fallbackRecommendations(candidates, profile, type);
    }

    const seen = new Set();
    const picked = recommendations
      .filter(item => Number.isInteger(item.index) && item.index >= 0 && item.index < candidates.length)
      .filter(item => {
        if (seen.has(item.index)) return false;
        seen.add(item.index);
        return true;
      });

    const rankedIndexes = new Set(picked.map(item => item.index));
    const rankedItems = picked.map((pick, rank) => ({
      ...candidates[pick.index],
      recommendationRank: rank + 1,
      recommendationReason: pick.reason || "자가점검 결과와 잘 맞는 선택이에요.",
    }));
    const rest = items.filter((_, index) => !rankedIndexes.has(index));
    return [...rankedItems, ...rest];
  }

  return { getProfile, recommend };
})();
