require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
app.use(express.json());

// Primary and backup Groq clients - fallback if primary hits rate limit
const primaryGroq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const backupGroq = process.env.GROQ_API_KEY_BACKUP
  ? new Groq({ apiKey: process.env.GROQ_API_KEY_BACKUP })
  : null;

// Use smaller faster model to save tokens (10x cheaper than llama-3.3-70b)
const MODEL = "llama-3.1-8b-instant";

const AMAZON_AFFILIATE_TAG = "marketgap-20";

const FLAG_MAP = {
  "Afghanistan":"🇦🇫","Albania":"🇦🇱","Algeria":"🇩🇿","Argentina":"🇦🇷",
  "Australia":"🇦🇺","Austria":"🇦🇹","Bangladesh":"🇧🇩","Belgium":"🇧🇪",
  "Brazil":"🇧🇷","Canada":"🇨🇦","Chile":"🇨🇱","China":"🇨🇳",
  "Colombia":"🇨🇴","Croatia":"🇭🇷","Czech Republic":"🇨🇿","Denmark":"🇩🇰",
  "Egypt":"🇪🇬","Ethiopia":"🇪🇹","Finland":"🇫🇮","France":"🇫🇷",
  "Germany":"🇩🇪","Ghana":"🇬🇭","Greece":"🇬🇷","Hungary":"🇭🇺",
  "India":"🇮🇳","Indonesia":"🇮🇩","Iran":"🇮🇷","Iraq":"🇮🇶",
  "Ireland":"🇮🇪","Israel":"🇮🇱","Italy":"🇮🇹","Japan":"🇯🇵",
  "Jordan":"🇯🇴","Kenya":"🇰🇪","Malaysia":"🇲🇾","Mexico":"🇲🇽",
  "Morocco":"🇲🇦","Netherlands":"🇳🇱","New Zealand":"🇳🇿","Nigeria":"🇳🇬",
  "Norway":"🇳🇴","Pakistan":"🇵🇰","Peru":"🇵🇪","Philippines":"🇵🇭",
  "Poland":"🇵🇱","Portugal":"🇵🇹","Romania":"🇷🇴","Russia":"🇷🇺",
  "Saudi Arabia":"🇸🇦","Singapore":"🇸🇬","South Africa":"🇿🇦",
  "South Korea":"🇰🇷","Spain":"🇪🇸","Sweden":"🇸🇪","Switzerland":"🇨🇭",
  "Taiwan":"🇹🇼","Thailand":"🇹🇭","Turkey":"🇹🇷","UAE":"🇦🇪",
  "Uganda":"🇺🇬","Ukraine":"🇺🇦","United Kingdom":"🇬🇧","USA":"🇺🇸",
  "Vietnam":"🇻🇳","Zimbabwe":"🇿🇼"
};

const CATEGORY_CONTEXT = {
  "Food & Beverage": { includes: "food brands, beverages, restaurant chains, snacks, drinks, dairy, packaged food, breweries, local cuisine", excludes: "banks, fintech, fashion, automotive, hospitals, telecom" },
  "Technology": { includes: "tech startups, mobile apps, software, e-commerce, social media, streaming, payment apps, hardware", excludes: "food brands, banks, fashion, automotive, hospitals, restaurants" },
  "Finance & Fintech": { includes: "local banks, payment apps, mobile money, digital wallets, insurance, microfinance, remittance, crypto", excludes: "food brands, fashion, automotive, hospitals, restaurants" },
  "Healthcare": { includes: "pharma, health insurance, hospital chains, medical devices, health apps, telemedicine, wellness brands", excludes: "food brands, banks, fashion, automotive, restaurants" },
  "Automotive": { includes: "car brands, motorcycles, EVs, auto parts, ride-hailing, transport innovations, bus companies", excludes: "food brands, banks, fashion, hospitals, restaurants" },
  "Retail & E-commerce": { includes: "e-commerce platforms, retail chains, supermarkets, local marketplaces, delivery services, shopping apps", excludes: "banks, hospitals, automotive, pharma" },
  "Entertainment & Media": { includes: "streaming, TV channels, music apps, gaming, social media, news platforms, film studios, sports leagues", excludes: "food brands, banks, fashion, automotive, hospitals" },
  "Education": { includes: "edtech platforms, online learning, tutoring, school software, educational publishers, exam prep", excludes: "food brands, banks, fashion, automotive, hospitals, entertainment" },
  "Fashion & Beauty": { includes: "clothing brands, cosmetics, skincare, local fashion designers, shoe brands, accessories, hair care", excludes: "food brands, banks, technology, automotive, hospitals" },
  "Real Estate": { includes: "property platforms, real estate agencies, proptech, construction companies, home rental apps, mortgage providers", excludes: "food brands, fashion, automotive, hospitals, entertainment" },
  "Agriculture & Food Tech": { includes: "agritech, seed companies, farming apps, agricultural equipment, crop insurance, fertilizer brands, food processing", excludes: "banks, fashion, automotive, hospitals, entertainment" },
  "Energy & CleanTech": { includes: "energy companies, solar providers, utility companies, EV infrastructure, cleantech, oil and gas brands, renewables", excludes: "food brands, banks, fashion, hospitals, restaurants" }
};

function getFlag(c) { return FLAG_MAP[c] || "🌐"; }

function normalizeResponse(data, countryA, countryB) {
  let out = { countryA: null, countryB: null, insights: data.insights || null };
  if (data.countryA) out.countryA = data.countryA;
  if (data.countryB) out.countryB = data.countryB;

  if (!out.countryA || !out.countryB) {
    const keys = Object.keys(data).filter(k => k !== "insights");
    for (const key of keys) {
      const val = data[key];
      if (!val || typeof val !== "object") continue;
      const name = (val.name || key || "").toLowerCase();
      if (name.includes(countryA.toLowerCase()) || key.toLowerCase().includes(countryA.toLowerCase())) out.countryA = val;
      else if (name.includes(countryB.toLowerCase()) || key.toLowerCase().includes(countryB.toLowerCase())) out.countryB = val;
      else if (!out.countryA) out.countryA = val;
      else if (!out.countryB) out.countryB = val;
    }
  }

  if (out.countryA) { out.countryA.name = countryA; out.countryA.flag = getFlag(countryA); if (!out.countryA.uniqueItems) out.countryA.uniqueItems = []; }
  if (out.countryB) { out.countryB.name = countryB; out.countryB.flag = getFlag(countryB); if (!out.countryB.uniqueItems) out.countryB.uniqueItems = []; }

  if (!out.insights) out.insights = {};

  // Normalize summary — model sometimes returns object instead of string
  const rawSummary = out.insights.summary;
  if (!rawSummary) {
    out.insights.summary = `Comparing the ${countryA} and ${countryB} markets reveals distinct differences in product availability, market maturity, and consumer preferences.`;
  } else if (typeof rawSummary === "object") {
    out.insights.summary = rawSummary.text || rawSummary.content || rawSummary.description || Object.values(rawSummary).find(v => typeof v === "string") || `Market comparison between ${countryA} and ${countryB}.`;
  } else {
    out.insights.summary = String(rawSummary);
  }

  // Normalize keyDifferences — ensure always array of strings
  if (!out.insights.keyDifferences || !Array.isArray(out.insights.keyDifferences)) {
    out.insights.keyDifferences = [];
  } else {
    out.insights.keyDifferences = out.insights.keyDifferences
      .map(d => typeof d === "object" ? (d.text || d.content || d.difference || JSON.stringify(d)) : String(d))
      .filter(Boolean);
  }

  // Normalize entrepreneurOpportunity — ensure always a string
  const rawOpp = out.insights.entrepreneurOpportunity;
  if (!rawOpp) {
    out.insights.entrepreneurOpportunity = `There are significant opportunities for entrepreneurs to bridge market gaps between ${countryA} and ${countryB} in this category.`;
  } else if (typeof rawOpp === "object") {
    out.insights.entrepreneurOpportunity = rawOpp.text || rawOpp.content || rawOpp.description || Object.values(rawOpp).find(v => typeof v === "string") || "";
  } else {
    out.insights.entrepreneurOpportunity = String(rawOpp);
  }

  // Normalize opportunityScore — ensure always integers
  if (!out.insights.opportunityScore) out.insights.opportunityScore = {};
  const sA = out.insights.opportunityScore.countryA;
  const sB = out.insights.opportunityScore.countryB;
  if (!sA || sA === 0) out.insights.opportunityScore.countryA = Math.min(92, Math.max(45, (out.countryA?.uniqueItems?.length || 5) * 4 + 42));
  if (!sB || sB === 0) out.insights.opportunityScore.countryB = Math.min(88, Math.max(40, (out.countryB?.uniqueItems?.length || 5) * 4 + 38));

  return out;
}

function enforceCategory(items, category) {
  const blocked = {
    "Food & Beverage": ["bank","fintech","insurance","loan","credit","mortgage","telecom","mobile network","fashion","clothing","hospital","pharma","automobile","car manufacturer"],
    "Technology": ["restaurant","food brand","beverage","brewery","fashion house","clothing brand","car dealership"],
    "Finance & Fintech": ["restaurant","food brand","beverage","clothing","fashion","hospital","car manufacturer"],
    "Healthcare": ["restaurant","food brand","beverage","bank","clothing","fashion","car manufacturer"],
    "Automotive": ["restaurant","food brand","beverage","bank","clothing","fashion","hospital"],
    "Fashion & Beauty": ["bank","restaurant","beverage","hospital","car manufacturer","fintech"],
    "Retail & E-commerce": ["bank","hospital","car manufacturer","pharmaceutical"],
    "Entertainment & Media": ["bank","hospital","car manufacturer","pharmaceutical"],
    "Education": ["bank","hospital","car manufacturer","food brand","beverage","fashion"],
    "Agriculture & Food Tech": ["bank","fashion","car manufacturer","entertainment"],
    "Energy & CleanTech": ["bank","fashion","food brand","restaurant","entertainment"],
    "Real Estate": ["food brand","beverage","fashion","entertainment","hospital"]
  };
  const kws = blocked[category] || [];
  if (!kws.length) return items;
  return items.filter(item => {
    const text = `${item.name} ${item.description} ${item.type}`.toLowerCase();
    return !kws.some(kw => text.includes(kw));
  });
}

function filterItems(items) {
  const seen = new Set();
  const blocklist = ["coca-cola","pepsi","mcdonald's","mcdonalds","kfc","pizza hut","starbucks","subway","burger king","nestle","unilever","google","microsoft","amazon","netflix","uber","facebook","meta"];
  return items.filter(item => {
    if (!item.name) return false;
    const key = item.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return !blocklist.some(b => key === b);
  });
}

function addAffiliateLinks(items) {
  return items.map(item => {
    item.amazonLink = (item.amazonSearch && item.amazonSearch !== "N/A")
      ? `https://www.amazon.com/s?k=${encodeURIComponent(item.amazonSearch)}&tag=${AMAZON_AFFILIATE_TAG}`
      : null;
    return item;
  });
}

function addImages(items) {
  return items.map(item => {
    const initials = item.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=1a1f2e&color=ffffff&size=200&bold=true&format=svg`;

    let domain = null;
    if (item.website && item.website !== "N/A") {
      try { domain = new URL(item.website).hostname.replace("www.", ""); } catch {}
    }

    // Cascading image sources — frontend tries each in order on error
    // Send all sources so frontend can try them in sequence
    item.imageSources = domain ? [
      `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://unavatar.io/${domain}`,
      `https://source.unsplash.com/80x80/?${encodeURIComponent(item.name)},brand,product`,
      avatarUrl
    ] : [
      `https://source.unsplash.com/80x80/?${encodeURIComponent(item.name)},brand,product`,
      avatarUrl
    ];

    item.imageUrl = item.imageSources[0];
    item.imageFallback = avatarUrl;
    return item;
  });
}

// Call Groq with automatic fallback to backup key if rate limited
async function callGroq(messages, maxTokens = 6000) {
  const tryCall = async (client, label) => {
    return await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.5,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    });
  };

  try {
    return await tryCall(primaryGroq, "primary");
  } catch (err) {
    // If rate limited and backup key exists, try backup
    if (err.status === 429 && backupGroq) {
      console.log("Primary key rate limited — switching to backup key");
      return await tryCall(backupGroq, "backup");
    }
    throw err;
  }
}

app.post("/api/compare", async (req, res) => {
  const { countryA, countryB, category } = req.body;
  if (!countryA || !countryB || !category) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const ctx = CATEGORY_CONTEXT[category] || {
    includes: `products and services in the ${category} sector`,
    excludes: "unrelated sectors"
  };

  // Compact prompt — ~40% fewer tokens than before
  const systemPrompt = `You are a market intelligence expert. Find real products/brands/services exclusive to specific countries.
RULES: Only "${category}" items (${ctx.includes}). Never include: ${ctx.excludes}. No global brands (Coca-Cola, McDonald's, Google, Apple, Netflix, Uber, etc). Use keys "countryA" and "countryB" only. Return raw JSON only.`;

  const userPrompt = `Compare "${category}" sector: ${countryA} vs ${countryB}. Return 15 real exclusive items per country.

{
  "countryA": {
    "name": "${countryA}", "flag": "${getFlag(countryA)}",
    "uniqueItems": [{
      "name": "string", "type": "Product|Service|Platform|Innovation|Brand",
      "description": "2 sentences with real facts",
      "about": "paragraph: history, market position, why not in ${countryB}",
      "founded": "year or N/A", "website": "https://url or N/A",
      "contact": "email or phone or N/A", "headquarters": "City, ${countryA}",
      "marketSize": "$X or N/A", "whyNotInOther": "specific reason",
      "amazonSearch": "search query or N/A", "category": "${category}",
      "tags": ["tag1","tag2","tag3"]
    }]
  },
  "countryB": {
    "name": "${countryB}", "flag": "${getFlag(countryB)}",
    "uniqueItems": [{ same structure as above }]
  },
  "insights": {
    "summary": "3 sentences comparing ${category} in both countries",
    "opportunityScore": { "countryA": 72, "countryB": 58 },
    "keyDifferences": ["diff1","diff2","diff3","diff4","diff5"],
    "entrepreneurOpportunity": "specific actionable paragraph"
  }
}

Return 15 items per country. Only real verified ${category} companies/products.`;

  try {
    const completion = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const text = completion.choices[0].message.content.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    const rawData = JSON.parse(clean);
    const data = normalizeResponse(rawData, countryA, countryB);

    if (data.countryA?.uniqueItems) {
      data.countryA.uniqueItems = addImages(addAffiliateLinks(enforceCategory(filterItems(data.countryA.uniqueItems), category)));
    }
    if (data.countryB?.uniqueItems) {
      data.countryB.uniqueItems = addImages(addAffiliateLinks(enforceCategory(filterItems(data.countryB.uniqueItems), category)));
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    const isRateLimit = err.status === 429;
    res.status(isRateLimit ? 429 : 500).json({
      error: isRateLimit
        ? "Daily request limit reached. Please try again later or check back in a few hours."
        : "Failed to generate comparison",
      details: err.message
    });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MarketGap server running on port ${PORT}`));