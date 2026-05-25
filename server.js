const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const OpenAI = require("openai");

const app = express();

require('dotenv').config({ override: true });

function readPublicConfigValue(objectName, keyName) {
  try {
    const source = fs.readFileSync(path.join(__dirname, "public", "returnfit-api-config.js"), "utf8");
    const objectPattern = new RegExp(`window\\.${objectName}\\s*=\\s*{([\\s\\S]*?)};`);
    const objectMatch = source.match(objectPattern);
    if (!objectMatch) return "";

    const keyMatch = objectMatch[1].match(new RegExp(`${keyName}:\\s*["']([^"']+)["']`));
    return keyMatch?.[1] || "";
  } catch {
    return "";
  }
}

function sendXmlOrApiError(res, xml, hint) {
  const xmlText = String(xml || "");
  const errorMatch = xmlText.match(/<error>([\s\S]*?)<\/error>/i);
  if (errorMatch) {
    return res.status(502).json({
      error: errorMatch[1].trim(),
      hint,
    });
  }

  return res.type("application/xml").send(xmlText);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function buildFallbackChatReply(message, profile = {}) {
  const text = String(message || "");
  const jobs = Array.isArray(profile.jobs) ? profile.jobs.join(", ") : "";
  const target = jobs || "관심 직무";

  if (/자격증|자격|certificate/i.test(text)) {
    if (/사무|행정|office/i.test(`${text} ${jobs}`)) {
      return "AI 연결이 잠시 제한되어 기본 가이드로 답변할게요. 사무직은 컴퓨터활용능력 2급/1급, 워드프로세서, 전산회계 2급, ITQ/OA 실무 자격이 도움이 됩니다. 채용정보 페이지에서는 사무보조·행정·총무 키워드를 보고, 훈련과정 페이지에서는 엑셀 실무와 전산회계 과정을 먼저 확인해보세요.";
    }
    if (/디자인|영상|콘텐츠/i.test(`${text} ${jobs}`)) {
      return "AI 연결이 잠시 제한되어 기본 가이드로 답변할게요. 디자인·콘텐츠 분야는 GTQ, 컴퓨터그래픽스운용기능사, 포트폴리오 제작 경험이 특히 중요합니다. 훈련과정 페이지에서는 포토샵·일러스트·영상편집 실습 과정을 우선 확인해보세요.";
    }
    if (/개발|it|코딩|데이터/i.test(`${text} ${jobs}`)) {
      return "AI 연결이 잠시 제한되어 기본 가이드로 답변할게요. IT 분야는 정보처리기능사/기사, SQLD, ADsP, 클라우드 기초 자격과 작은 프로젝트 포트폴리오가 도움이 됩니다. 훈련과정 페이지에서는 웹개발, 데이터 분석, SQL 과정을 먼저 살펴보세요.";
    }
    return `AI 연결이 잠시 제한되어 기본 가이드로 답변할게요. ${target}에 맞는 자격증은 채용공고에서 반복되는 우대조건을 먼저 보고 고르는 게 좋아요. 우선 OA/컴퓨터 활용, 직무 기초 실무 과정, 포트폴리오나 실습 결과물을 함께 준비하는 방향을 추천합니다.`;
  }

  if (/훈련|과정|배움|교육/i.test(text)) {
    return `AI 연결이 잠시 제한되어 기본 가이드로 답변할게요. ${target} 기준으로는 바로 취업 지원보다 부족한 실무 키워드를 채우는 훈련과정을 1-2개 고르는 것이 좋습니다. 훈련과정 페이지에서 지역과 직무 키워드로 검색하고, 기간이 짧고 결과물이 남는 과정을 먼저 확인해보세요.`;
  }

  if (/보조금|지원금|정부지원|혜택|수당|보조금24/i.test(text)) {
    return "AI 연결이 잠시 제한되어 기본 가이드로 답변할게요. 지원금이나 공공혜택은 보조금24 페이지로 이동해서 지역과 키워드로 먼저 확인해보세요. 자가점검 기본정보의 연령대, 지역, 관심직무를 기준으로 본인에게 맞는 항목부터 살펴보는 것이 좋습니다.";
  }

  if (/채용|공고|일자리|취업/i.test(text)) {
    return `AI 연결이 잠시 제한되어 기본 가이드로 답변할게요. ${target} 채용정보는 지역, 경력무관, 직무 키워드가 맞는 항목부터 보는 것이 좋습니다. 채용정보 페이지에서 추천 1-3번을 먼저 확인하고, 조건이 맞으면 필요한 자격증이나 훈련과정을 함께 연결해보세요.`;
  }

  return "AI 연결이 잠시 제한되어 기본 가이드로 답변할게요. 먼저 추천 1-3번 채용정보와 훈련과정을 확인한 뒤, 관심 직무에 반복해서 나오는 우대조건을 자격증이나 포트폴리오 목표로 잡으면 좋습니다.";
}

function isReturnFitChatInScope(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  if (/^(안녕|안녕하세요|고마워|감사|도와줘|뭐부터|시작|추천)/.test(text)) return true;

  const allowedPatterns = [
    /리턴핏|자가점검|자가검진|설문|구직|취업|채용|공고|일자리|면접|이력서|자소서|직무|커리어|경력|포트폴리오/,
    /훈련|교육|과정|내일배움|국민내일배움카드|자격증|컴활|워드|전산|sqld|adsp|정보처리/,
    /보조금|지원금|정부지원|정부24|보조금24|청년지원|혜택|수당|상담|기관|고용센터/,
    /우울|불안|마음|멘탈|정신건강|상담|위기|자살|스트레스/,
    /프로필|관심분야|관심직무|지역|연령|준비도|통계|점수|결과/,
  ];

  const offTopicPatterns = [
    /게임\s*공략|주식|코인|암호화폐|연애|맛집|여행|영화|드라마|스포츠|날씨/,
    /코딩|프로그래밍|html|css|javascript|파이썬|python|react|node/,
    /숙제|수학|과학|역사|영어\s*번역|소설|시\s*써|노래|가사/,
  ];

  const hasAllowedTopic = allowedPatterns.some(pattern => pattern.test(text));
  const hasOffTopicSignal = offTopicPatterns.some(pattern => pattern.test(text));
  if (hasAllowedTopic) return true;
  if (hasOffTopicSignal) return false;
  return false;
}

function cleanAssistantReply(reply) {
  return String(reply || "")
    .replace(/```[\s\S]*?```/g, "화면 코드는 생략하고, 관련 페이지로 이동해서 확인해 주세요.")
    .replace(/\bJob_Posting\.html\b/g, "채용정보 페이지")
    .replace(/\bRecruitment_Information\.html\b/g, "보조금24 페이지")
    .replace(/\bTrainning\.html\b/g, "훈련과정 페이지")
    .replace(/\bSupport_Agency\.html\b/g, "도움기관 페이지")
    .replace(/\bAi_Agent\.html\b/g, "AI 도우미 페이지")
    .replace(/\bMain\.html\b/g, "메인 페이지")
    .trim();
}

const DATA_DIR = path.join(os.tmpdir(), "returnfit-data");
const BASIC_INFO_DB_PATH = path.join(DATA_DIR, "basic-info.json");
const PROFILE_DB_PATH = path.join(DATA_DIR, "profiles.json");

function readBasicInfoDb() {
  try {
    if (!fs.existsSync(BASIC_INFO_DB_PATH)) return {};
    return JSON.parse(fs.readFileSync(BASIC_INFO_DB_PATH, "utf8")) || {};
  } catch {
    return {};
  }
}

function writeBasicInfoDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(BASIC_INFO_DB_PATH, JSON.stringify(db, null, 2));
}

function sanitizeBasicInfo(value = {}) {
  const readText = input => String(input || "").trim().slice(0, 40);
  const readList = input => Array.isArray(input)
    ? input.map(readText).filter(Boolean).slice(0, 12)
    : [];

  return {
    age: readText(value.age),
    region: readText(value.region),
    jobs: readList(value.jobs),
    supports: readList(value.supports),
  };
}

function readJsonDb(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8")) || {};
  } catch {
    return {};
  }
}

async function writeJsonDb(filePath, db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (let i = 0; i < 5; i++) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(db, null, 2));
      return;
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        if (i === 4) throw err;
        await new Promise(resolve => setTimeout(resolve, 50));
      } else {
        throw err;
      }
    }
  }
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const raw = forwarded || req.socket.remoteAddress || "unknown";
  return raw.replace(/^::ffff:/, "");
}

function getProfileId(req) {
  return `ip-${crypto.createHash("sha256").update(getClientIp(req)).digest("hex").slice(0, 16)}`;
}

function createPublicProfileId(existingProfiles) {
  let id = "";
  do {
    id = String(Math.floor(100000 + Math.random() * 900000));
  } while (existingProfiles.some(profile => profile.profileId === id));
  return id;
}

function sanitizeProfile(value = {}) {
  const readText = input => String(input || "").trim().slice(0, 50);
  return {
    name: readText(value.name),
    interests: readText(value.interests),
  };
}

function sanitizeSurvey(value = {}) {
  return {
    basicInfo: value.basicInfo ? sanitizeBasicInfo(value.basicInfo) : undefined,
    reentryDraft: value.reentryDraft && typeof value.reentryDraft === "object" ? value.reentryDraft : undefined,
    phq9Draft: value.phq9Draft && typeof value.phq9Draft === "object" ? value.phq9Draft : undefined,
  };
}

function calculateReentryResult(draft) {
  if (!Array.isArray(draft)) return undefined;
  
  const scoreByQuestion = [
    [1, 0], [0, 2], [0, 2], [1, 0], [2, 1, 0], [2, 0, 1],
    [2, 1, 0], [2, 1, 0], [2, 1, 0], [1, 0], [2, 0], [1, 0, 0],
    [0, 1], [2, 1, 0], [2, 1, 0], [1, 0, 0]
  ];

  const maxRiskScore = scoreByQuestion.reduce((sum, scores) => sum + Math.max(...scores), 0);
  let riskScore = 0;
  
  const answers = draft.map((item, index) => {
    const s = scoreByQuestion[index]?.[item.buttonIndex] ?? 0;
    riskScore += s;
    return { ...item, riskScore: s };
  });

  const readinessScore = Math.max(0, Math.min(100, Math.round(((maxRiskScore - riskScore) / maxRiskScore) * 100)));
  const supportNeedScore = Math.max(0, Math.min(100, Math.round((riskScore / maxRiskScore) * 100)));

  return {
    riskScore,
    maxRiskScore,
    readinessScore,
    supportNeedScore,
    scoringMethod: "readinessScore = ((maxRiskScore - riskScore) / maxRiskScore) * 100",
    answers,
    completedAt: new Date().toISOString()
  };
}

function calculatePhq9Result(draft) {
  if (!draft || typeof draft !== "object") return undefined;
  
  const totalScore = Object.values(draft).reduce((sum, value) => sum + Number(value || 0), 0);
  const item9Score = Number(draft["question-9"] || 0);

  let guide = "";
  if (item9Score > 0 || totalScore >= 15) {
    guide = "도움 연결을 먼저 확인하는 화면으로 이동하면 좋아요.";
  } else if (totalScore >= 10) {
    guide = "마음 돌봄과 취업 준비를 함께 확인하는 화면으로 이동하면 좋아요.";
  } else if (totalScore >= 5) {
    guide = "작은 행동부터 시작하는 추천 화면으로 이동하면 좋아요.";
  } else {
    guide = "채용정보와 훈련과정을 확인하는 화면으로 이동하면 좋아요.";
  }

  return { phq9Score: totalScore, phq9Guide: guide };
}

async function upsertProfile(req, patch = {}) {
  const db = readJsonDb(PROFILE_DB_PATH);
  const ipKey = getProfileId(req);
  const current = db[ipKey] || {};
  const profileId = /^\d{6}$/.test(String(current.profileId || ""))
    ? current.profileId
    : createPublicProfileId(Object.values(db));
  db[ipKey] = {
    profileId,
    ipKey,
    name: current.name || "",
    interests: current.interests || "",
    basicInfo: current.basicInfo || null,
    survey: current.survey || {},
    createdAt: current.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...patch,
  };
  await writeJsonDb(PROFILE_DB_PATH, db);
  return db[ipKey];
}

function serializeProfile(profile = {}) {
  return {
    profileId: profile.profileId,
    name: profile.name || "",
    interests: profile.interests || "",
    basicInfo: profile.basicInfo || null,
    survey: profile.survey || {},
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function getReadinessBucket(score) {
  if (score == null || Number.isNaN(Number(score))) return "미완료";
  const value = Number(score);
  if (value >= 75) return "재진입 준비형";
  if (value >= 50) return "단계적 준비형";
  return "지원 연결 우선형";
}

function getPhqBucket(score) {
  if (score == null || Number.isNaN(Number(score))) return "미완료";
  const value = Number(score);
  if (value >= 20) return "긴급 점검";
  if (value >= 10) return "상담 권장";
  if (value >= 5) return "관심 필요";
  return "안정";
}

function incrementCount(target, key, amount = 1) {
  const label = key || "미입력";
  target[label] = (target[label] || 0) + amount;
}

function createEmptyAgeStats() {
  return {
    participants: 0,
    completedReentry: 0,
    readinessTotal: 0,
    readinessAverage: 0,
    readinessBuckets: {},
    jobs: {},
    supports: {},
    regions: {},
  };
}

function buildAnalytics() {
  const profiles = Object.values(readJsonDb(PROFILE_DB_PATH));
  const stats = {
    totalProfiles: 0,
    totalBasicInfo: 0,
    totalCompletedReentry: 0,
    ageGroups: {},
    overall: createEmptyAgeStats(),
    updatedAt: new Date().toISOString(),
  };

  profiles.forEach(profile => {
    const basicInfo = profile.basicInfo || profile.survey?.basicInfo || {};
    const hasBasicInfo = Boolean(
      basicInfo.age ||
      basicInfo.region ||
      basicInfo.jobs?.length ||
      basicInfo.supports?.length
    );
    const hasSurveyResult = profile.survey?.reentryResult;
    if (!hasBasicInfo && !hasSurveyResult) return;
    stats.totalProfiles += 1;

    const age = basicInfo.age || "미입력";
    const survey = profile.survey || {};
    const readinessScore = survey.reentryResult?.readinessScore;

    if (!stats.ageGroups[age]) stats.ageGroups[age] = createEmptyAgeStats();
    const targets = [stats.ageGroups[age], stats.overall];

    if (hasBasicInfo) {
      stats.totalBasicInfo += 1;
    }

    targets.forEach(target => {
      target.participants += 1;
      incrementCount(target.regions, basicInfo.region);
      (basicInfo.jobs || []).forEach(job => incrementCount(target.jobs, job));
      (basicInfo.supports || []).forEach(support => incrementCount(target.supports, support));
      incrementCount(target.readinessBuckets, getReadinessBucket(readinessScore));
      if (readinessScore != null && !Number.isNaN(Number(readinessScore))) {
        target.completedReentry += 1;
        target.readinessTotal += Number(readinessScore);
      }
    });
  });

  Object.values(stats.ageGroups).concat(stats.overall).forEach(target => {
    target.readinessAverage = target.completedReentry
      ? Math.round(target.readinessTotal / target.completedReentry)
      : 0;
    delete target.readinessTotal;
  });

  stats.totalCompletedReentry = stats.overall.completedReentry;
  return stats;
}


const PORT = process.env.PORT || 5500;
const HOST = process.env.HOST || "0.0.0.0";
const GOV24_SERVICE_API_KEY =
  process.env.GOV24_SERVICE_API_KEY ||
  process.env.PUBLIC_SERVICE_API_KEY ||
  readPublicConfigValue("RETURNFIT_API_KEYS", "recruitment");
const GOV24_SERVICE_ENDPOINT =
  process.env.GOV24_SERVICE_ENDPOINT ||
  readPublicConfigValue("RETURNFIT_API_ENDPOINTS", "recruitment") ||
  "https://api.odcloud.kr/api/gov24/v3/serviceList";
const WORK24_TRAINING_API_KEY =
  process.env.WORK24_TRAINING_API_KEY ||
  process.env.NATIONAL_TOMORROW_CARD_TRAINING_API_KEY ||
  readPublicConfigValue("RETURNFIT_API_KEYS", "nationalTomorrowCardTraining");
const WORK24_JOB_API_KEY =
  process.env.WORK24_JOB_API_KEY ||
  process.env.WORK24_API_KEY ||
  process.env.SARAMIN_API_KEY ||
  "";
const WORK24_JOB_ENDPOINT =
  process.env.WORK24_JOB_ENDPOINT ||
  "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L21.do";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/profile/me", async (req, res) => {
  const profile = await upsertProfile(req);
  return res.json({ profile: serializeProfile(profile) });
});

app.post("/api/profile/me", async (req, res) => {
  const next = sanitizeProfile(req.body || {});
  const current = await upsertProfile(req);
  const profile = await upsertProfile(req, {
    ...current,
    name: next.name,
    interests: next.interests,
  });
  return res.json({ ok: true, profile: serializeProfile(profile) });
});

app.get("/api/analytics/summary", (req, res) => {
  return res.json(buildAnalytics());
});

app.get("/api/survey/me", async (req, res) => {
  const profile = await upsertProfile(req);
  return res.json({
    profileId: profile.profileId,
    basicInfo: profile.basicInfo || profile.survey?.basicInfo || null,
    survey: profile.survey || {},
  });
});

app.post("/api/survey", async (req, res) => {
  const profile = await upsertProfile(req);
  const surveyPatch = sanitizeSurvey(req.body || {});
  const survey = { ...(profile.survey || {}) };

  Object.entries(surveyPatch).forEach(([key, value]) => {
    if (value !== undefined) survey[key] = value;
  });

  if (surveyPatch.reentryDraft !== undefined) {
    survey.reentryResult = calculateReentryResult(survey.reentryDraft);
  }
  
  if (surveyPatch.phq9Draft !== undefined) {
    const phq9Res = calculatePhq9Result(survey.phq9Draft);
    if (phq9Res) {
      survey.phq9Score = phq9Res.phq9Score;
      survey.phq9Guide = phq9Res.phq9Guide;
    } else {
      survey.phq9Score = undefined;
      survey.phq9Guide = undefined;
    }
  }

  survey.updatedAt = new Date().toISOString();

  const nextProfile = await upsertProfile(req, {
    ...profile,
    basicInfo: survey.basicInfo || profile.basicInfo || null,
    survey,
  });

  return res.json({ ok: true, profile: serializeProfile(nextProfile) });
});

app.delete("/api/survey/me", async (req, res) => {
  const profile = await upsertProfile(req);
  const nextProfile = await upsertProfile(req, {
    ...profile,
    basicInfo: null,
    survey: {},
  });
  return res.json({ ok: true, profile: serializeProfile(nextProfile) });
});


app.get("/api/basic-info/:sessionId", (req, res) => {
  const sessionId = String(req.params.sessionId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!sessionId) return res.status(400).json({ error: "sessionId is required." });

  const db = readBasicInfoDb();
  return res.json({
    basicInfo: db[sessionId]?.basicInfo || null,
    updatedAt: db[sessionId]?.updatedAt || null,
  });
});

app.post("/api/basic-info", (req, res) => {
  const sessionId = String(req.body?.sessionId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  if (!sessionId) return res.status(400).json({ error: "sessionId is required." });

  const db = readBasicInfoDb();
  db[sessionId] = {
    basicInfo: sanitizeBasicInfo(req.body?.basicInfo),
    updatedAt: new Date().toISOString(),
  };
  writeBasicInfoDb(db);
  upsertProfile(req, {
    basicInfo: db[sessionId].basicInfo,
    survey: {
      ...(upsertProfile(req).survey || {}),
      basicInfo: db[sessionId].basicInfo,
      updatedAt: db[sessionId].updatedAt,
    },
  });

  return res.json({ ok: true, updatedAt: db[sessionId].updatedAt });
});

app.get("/api/public-services", async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const perPage = Math.min(Number(req.query.perPage || 10), 50);
    const keyword = String(req.query.keyword || "").trim();
    const region = String(req.query.region || "").trim();

    if (!GOV24_SERVICE_API_KEY || !GOV24_SERVICE_ENDPOINT) {
      return res.status(500).json({
        error: "Gov24 service API key or endpoint is missing.",
      });
    }

    const params = {
      page,
      perPage,
      serviceKey: GOV24_SERVICE_API_KEY,
    };

    if (region && region !== "전체") {
      params["cond[소관기관명::LIKE]"] = region;
    }

    if (keyword) {
      params["cond[서비스명::LIKE]"] = keyword;
    }

    const response = await axios.get(GOV24_SERVICE_ENDPOINT, {
      timeout: 10000,
      params,
    });

    return res.json(response.data);
  } catch (error) {
    console.error("Gov24 service API error:", error.message);
    return res.status(500).json({
      error: "Gov24 service API request failed.",
      detail: error.message,
    });
  }
});

app.get("/api/trainings", async (req, res) => {
  try {
    const pageNum = Number(req.query.page || req.query.pageNum || 1);
    const pageSize = Math.min(Number(req.query.pageSize || 9), 30);
    const keyword = String(req.query.keyword || "").trim();
    const region = String(req.query.region || "").trim();
    const startDate = String(req.query.startDate || "");
    const endDate = String(req.query.endDate || "");

    if (!WORK24_TRAINING_API_KEY) {
      return res.status(500).json({
        error: "Work24 training API key is missing.",
      });
    }

    const params = {
      authKey: WORK24_TRAINING_API_KEY,
      returnType: "XML",
      outType: "1",
      pageNum,
      pageSize,
      srchTraStDt: startDate,
      srchTraEndDt: endDate,
      sort: "ASC",
      sortCol: "2",
    };

    if (region) params.srchTraArea1 = region;
    if (keyword) params.srchTraProcessNm = keyword;

    const response = await axios.get(
      "https://www.work24.go.kr/cm/openApi/call/hr/callOpenApiSvcInfo310L01.do",
      { timeout: 10000, params }
    );

    return sendXmlOrApiError(
      res,
      response.data,
      "Check the Work24 training API key permission or request parameters."
    );
  } catch (error) {
    console.error("Work24 training API error:", error.message);
    return res.status(500).json({
      error: "Work24 training API request failed.",
      detail: error.message,
    });
  }
});

app.get("/api/job-postings", async (req, res) => {
  try {
    const startPage = Number(req.query.page || req.query.startPage || 1);
    const display = Math.min(Number(req.query.display || 6), 30);
    const region = String(req.query.region || "").trim();

    if (!WORK24_JOB_API_KEY) {
      return res.status(500).json({
        error: "Work24 job API key is missing. Set WORK24_JOB_API_KEY or WORK24_API_KEY in .env.",
      });
    }

    const params = {
      authKey: WORK24_JOB_API_KEY,
      callTp: "L",
      returnType: "XML",
      startPage,
      display,
    };

    if (region && region !== "전체") params.regionNm = region;

    const response = await axios.get(WORK24_JOB_ENDPOINT, {
      timeout: 10000,
      params,
    });

    return sendXmlOrApiError(
      res,
      response.data,
      "Check the Work24 job API key permission, WORK24_JOB_ENDPOINT, or request parameters."
    );
  } catch (error) {
    console.error("Work24 job API error:", error.message);
    return res.status(500).json({
      error: "Work24 job API request failed.",
      detail: error.message,
    });
  }
});

app.post("/api/recommendations", async (req, res) => {
  try {
    const { type = "jobs", items = [] } = req.body;
    const normalizedItems = Array.isArray(items) ? items.slice(0, 12) : [];

    const userProfile = await upsertProfile(req);
    const survey = userProfile.survey || {};
    const basicInfo = userProfile.basicInfo || survey.basicInfo || {};
    const reentryResult = survey.reentryResult || {};
    const phq9Result = survey.phq9Result || {};
    
    const profile = {
      age: basicInfo.age || "",
      region: basicInfo.region || "",
      jobs: basicInfo.jobs || [],
      supports: basicInfo.supports || [],
      readinessScore: Number(reentryResult.readinessScore || 0),
      phq9Score: Number(phq9Result.phq9Score || 0),
      hasBasicInfo: Boolean(basicInfo.age || basicInfo.region || basicInfo.jobs?.length || basicInfo.supports?.length),
      hasReentryResult: Boolean(reentryResult && reentryResult.readinessScore !== undefined),
      hasPhq9Result: Boolean(phq9Result && phq9Result.phq9Score !== undefined),
    };

    if (!normalizedItems.length) {
      return res.json({ recommendations: [] });
    }

    if (!openai) {
      return res.status(500).json({
        error: "OpenAI API key is missing. Set OPENAI_API_KEY in .env.",
      });
    }

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content: `You are ReturnFit's strict AI recommendation engine for young Korean job seekers.
Evaluate and sort all provided items by relevance based on the user's self-check profile (Age, Region, Jobs, Supports, Readiness Score, PHQ-9 Score).

CRITICAL RANKING RULES:
1. Region Match (1st Priority): You MUST prioritize items where the region exactly matches the user's region. This is the absolute first priority.
2. Job/Occupation Match (2nd Priority): After region matching, prioritize items that match the user's interested jobs or keywords.
3. Readiness Score (0~18):
   - High (12~18): Rank direct job postings and high-intensity training first.
   - Mid (6~11): Rank short-term training, internships, and counseling first.
   - Low (0~5): Skip aggressive jobs; prioritize basic living subsidies and foundational support.
4. PHQ-9 Depression Score (0~27):
   - If PHQ-9 >= 10: Prioritize "Support Agencies" (Mental Health/Youth Centers) over jobs. The reason MUST be empathetic ("지금은 마음을 돌보는 게 가장 중요해요. 이곳에서 도움을 받아보시는 건 어떨까요?").

Return the full list of items in descending order of relevance. Provide a concise (under 45 chars), warm, and encouraging reason in Korean for each.
Return ONLY JSON in this exact shape:
{"recommendations":[{"index":0,"reason":"Korean reason under 45 chars"}]}
The index must refer to the zero-based input item index. Do not invent items or omit items.`
        },
        {
          role: "user",
          content: JSON.stringify({
            type,
            profile,
            items: normalizedItems.map((item, index) => ({
              index,
              title: item.title || "",
              organization: item.company || item.school || "",
              region: item.region || item.address || "",
              summary: item.summary || item.target || item.type || "",
              tags: item.tags || [],
              deadline: item.deadline || "",
            })),
          })
        }
      ]
    });

    const parsed = tryParseJson(response.choices[0].message.content);
    const recommendations = (parsed?.recommendations || [])
      .filter(item => Number.isInteger(item.index) && item.index >= 0 && item.index < normalizedItems.length)
      .map(item => ({
        index: item.index,
        reason: String(item.reason || "자가점검 결과와 잘 맞는 선택이에요.").slice(0, 80),
      }));

    return res.json({ recommendations });
  } catch (error) {
    console.error("Recommendation error:", error.message);
    return res.status(500).json({
      error: "AI recommendation failed.",
      detail: error.message,
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [], profile = {} } = req.body;
    if (!message) return res.status(400).json({ error: "message is required." });
    if (!isReturnFitChatInScope(message)) {
      return res.json({
        reply: "이 질문은 AI 도우미의 역할에서 벗어나 있어요. 리턴핏 AI 도우미는 자가점검 결과, 채용정보, 보조금24 지원정보, 훈련과정, 자격증 준비, 도움기관 연결에 대해서만 안내할게요.",
      });
    }
    if (!openai) {
      return res.status(500).json({
        error: "OpenAI API key is missing. Set OPENAI_API_KEY in .env.",
      });
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      max_output_tokens: 500,
      instructions: `You are ReturnFit's AI career assistant for young Korean job seekers.
Use the provided self-check profile when it is available.
Only answer questions inside ReturnFit's scope: self-check results, job postings, Subsidy24/public support benefits, training courses, job preparation steps, useful certificates, local support agencies, and job-search-related emotional support.
If the user asks outside this scope, politely say the question is outside the AI assistant role and invite them to ask about ReturnFit topics.
Help users understand recruitment information, Subsidy24 support benefits, training courses, job preparation steps, and useful certificates.
When asked about certificates, recommend practical Korean certificates or portfolio steps related to the user's target job.
When asked what to do next, suggest a small sequence: suitable job info page, training page, certificate/portfolio action, and support agency if needed.
Answer in Korean, warmly and concretely in 3-5 sentences.
Never output HTML code, code blocks, or raw file names such as .html.
When guiding navigation, say "채용정보 페이지로 이동하세요", "보조금24 페이지로 이동하세요", "훈련과정 페이지로 이동하세요", or "도움기관 페이지로 이동하세요".
For recruitment info, guide users to the 채용정보 page.
For public support benefits or subsidy questions, guide users to the 보조금24 page.
For training questions, guide users to the 훈련과정 page.
For counseling or support agencies, guide users to the 도움기관 page.
If PHQ-9 is high or the user expresses danger/self-harm risk, mention emergency contacts 109, 1577-0199, and 129 first.`,
      input: [
        { role: "system", content: `Self-check profile JSON: ${JSON.stringify(profile)}` },
        ...history.slice(-10),
        { role: "user", content: message },
      ],
    });

    return res.json({
      reply: cleanAssistantReply(response.output_text) || "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    });
  } catch (error) {
    console.error("OpenAI error:", error.message);
    return res.status(error.status || 500).json({
      error: "AI response failed.",
      detail: error.message,
      reply: cleanAssistantReply(buildFallbackChatReply(req.body?.message, req.body?.profile)),
    });
  }
});

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(address => address && address.family === "IPv4" && !address.internal)
    .map(address => address.address);
}

app.listen(PORT, HOST, () => {
  console.log(`Server running locally: http://localhost:${PORT}`);
  getLanAddresses().forEach(address => {
    console.log(`Server available on your network: http://${address}:${PORT}/Main.html`);
  });
});
