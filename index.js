require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const AMAZON_AFFILIATE_TAG = "marketgap-20";

const FLAG_MAP = {
  "Afghanistan": "🇦🇫", "Albania": "🇦🇱", "Algeria": "🇩🇿", "Argentina": "🇦🇷",
  "Australia": "🇦🇺", "Austria": "🇦🇹", "Bangladesh": "🇧🇩", "Belgium": "🇧🇪",
  "Brazil": "🇧🇷", "Canada": "🇨🇦", "Chile": "🇨🇱", "China": "🇨🇳",
  "Colombia": "🇨🇴", "Croatia": "🇭🇷", "Czech Republic": "🇨🇿", "Denmark": "🇩🇰",
  "Egypt": "🇪🇬", "Ethiopia": "🇪🇹", "Finland": "🇫🇮", "France": "🇫🇷",
  "Germany": "🇩🇪", "Ghana": "🇬🇭", "Greece": "🇬🇷", "Hungary": "🇭🇺",
  "India": "🇮🇳", "Indonesia": "🇮🇩", "Iran": "🇮🇷", "Iraq": "🇮🇶",
  "Ireland": "🇮🇪", "Israel": "🇮🇱", "Italy": "🇮🇹", "Japan": "🇯🇵",
  "Jordan": "🇯🇴", "Kenya": "🇰🇪", "Malaysia": "🇲🇾", "Mexico": "🇲🇽",
  "Morocco": "🇲🇦", "Netherlands": "🇳🇱", "New Zealand": "🇳🇿", "Nigeria": "🇳🇬",
  "Norway": "🇳🇴", "Pakistan": "🇵🇰", "Peru": "🇵🇪", "Philippines": "🇵🇭",
  "Poland": "🇵🇱", "Portugal": "🇵🇹", "Romania": "🇷🇴", "Russia": "🇷🇺",
  "Saudi Arabia": "🇸🇦", "Singapore": "🇸🇬", "South Africa": "🇿🇦",
  "South Korea": "🇰🇷", "Spain": "🇪🇸", "Sweden": "🇸🇪", "Switzerland": "🇨🇭",
  "Taiwan": "🇹🇼", "Thailand": "🇹🇭", "Turkey": "🇹🇷", "UAE": "🇦🇪",
  "Uganda": "🇺🇬", "Ukraine": "🇺🇦", "United Kingdom": "🇬🇧", "USA": "🇺🇸",
  "Vietnam": "🇻🇳", "Zimbabwe": "🇿🇼"
};

// What each category includes and explicitly excludes
const CATEGORY_CONTEXT = {
  "Food & Beverage": {
    includes: "food brands, beverage companies, snack manufacturers, local drinks, traditional food products, restaurant chains, food delivery services, local cuisine brands, packaged food companies, breweries, juice brands, dairy brands, instant noodle brands, condiment brands, spice companies",
    excludes: "banks, fintech, technology apps, fashion, automotive, healthcare, real estate, education, telecom, insurance"
  },
  "Technology": {
    includes: "tech startups, mobile apps, software platforms, e-commerce sites, social media platforms, ride-hailing apps, local search engines, messaging apps, local streaming platforms, payment apps, tech hardware companies",
    excludes: "food brands, banks, fashion, automotive, healthcare, real estate, education, restaurants"
  },
  "Finance & Fintech": {
    includes: "local banks, payment apps, mobile money platforms, digital wallets, microfinance institutions, local stock exchanges, insurance companies, local fintech startups, remittance services, crypto exchanges",
    excludes: "food brands, tech apps unrelated to finance, fashion, automotive, healthcare, restaurants, education"
  },
  "Healthcare": {
    includes: "local pharma companies, health insurance providers, hospital chains, medical devices, health apps, telemedicine platforms, local drug brands, wellness brands, local medical innovations",
    excludes: "food brands, banks, fashion, automotive, real estate, education, tech unrelated to health"
  },
  "Automotive": {
    includes: "local car manufacturers, motorcycle brands, electric vehicle companies, auto parts brands, local dealership chains, ride-hailing services, local transport innovations, bus companies",
    excludes: "food brands, banks, fashion, healthcare, real estate, education, tech unrelated to transport"
  },
  "Retail & E-commerce": {
    includes: "local e-commerce platforms, retail chains, supermarket brands, local marketplace apps, local department stores, domestic shopping platforms, local delivery services",
    excludes: "food brands, banks, fashion unrelated to retail, automotive, healthcare, education"
  },
  "Entertainment & Media": {
    includes: "local streaming platforms, TV channels, local music apps, gaming companies, local social media, local news platforms, radio stations, local film studios, local sports leagues",
    excludes: "food brands, banks, fashion, automotive, healthcare, real estate, education"
  },
  "Education": {
    includes: "local edtech platforms, universities, online learning apps, tutoring services, local exam prep services, school management software, local educational publishers",
    excludes: "food brands, banks, fashion, automotive, healthcare, real estate, entertainment"
  },
  "Fashion & Beauty": {
    includes: "local clothing brands, beauty products, cosmetics companies, local fashion designers, skincare brands, local shoe brands, accessories brands, hair care brands",
    excludes: "food brands, banks, technology, automotive, healthcare, real estate, education"
  },
  "Real Estate": {
    includes: "local property platforms, real estate agencies, proptech startups, local construction companies, home rental apps, local mortgage providers",
    excludes: "food brands, banks unrelated to property, fashion, automotive, healthcare, education, entertainment"
  },
  "Agriculture & Food Tech": {
    includes: "agritech startups, local seed companies, farming apps, agricultural equipment brands, crop insurance platforms, local fertilizer brands, food processing companies, farm-to-table platforms",
    excludes: "banks, fashion, automotive, healthcare unrelated to agriculture, real estate, entertainment"
  },
  "Energy & CleanTech": {
    includes: "local energy companies, solar providers, local utility companies, EV infrastructure, cleantech startups, local oil and gas brands, renewable energy innovators",
    excludes: "food brands, banks, fashion, automotive unrelated to energy, healthcare, real estate, education"
  }
};

function getFlag(country) {
  return FLAG_MAP[country] || "🌐";
}

function normalizeResponse(data, countryA, countryB) {
  let normalized = { countryA: null, countryB: null, insights: data.insights || null };

  if (data.countryA) normalized.countryA = data.countryA;
  if (data.countryB) normalized.countryB = data.countryB;

  if (!normalized.countryA || !normalized.countryB) {
    const keys = Object.keys(data).filter(k => k !== "insights");
    for (const key of keys) {
      const val = data[key];
      if (!val || typeof val !== "object") continue;
      const name = (val.name || key || "").toLowerCase();
      const cA = countryA.toLowerCase();
      const cB = countryB.toLowerCase();
      if (name.includes(cA) || key.toLowerCase().includes(cA)) {
        normalized.countryA = val;
      } else if (name.includes(cB) || key.toLowerCase().includes(cB)) {
        normalized.countryB = val;
      } else if (!normalized.countryA) {
        normalized.countryA = val;
      } else if (!normalized.countryB) {
        normalized.countryB = val;
      }
    }
  }

  if (normalized.countryA) {
    normalized.countryA.name = countryA;
    normalized.countryA.flag = getFlag(countryA);
    if (!normalized.countryA.uniqueItems) normalized.countryA.uniqueItems = [];
  }
  if (normalized.countryB) {
    normalized.countryB.name = countryB;
    normalized.countryB.flag = getFlag(countryB);
    if (!normalized.countryB.uniqueItems) normalized.countryB.uniqueItems = [];
  }

  if (!normalized.insights) normalized.insights = {};
  if (!normalized.insights.opportunityScore) normalized.insights.opportunityScore = {};

  const scoreA = normalized.insights.opportunityScore.countryA;
  const scoreB = normalized.insights.opportunityScore.countryB;
  if (!scoreA || scoreA === 0 || typeof scoreA !== "number") {
    normalized.insights.opportunityScore.countryA = Math.min(92, Math.max(45,
      (normalized.countryA?.uniqueItems?.length || 5) * 4 + 42));
  }
  if (!scoreB || scoreB === 0 || typeof scoreB !== "number") {
    normalized.insights.opportunityScore.countryB = Math.min(88, Math.max(40,
      (normalized.countryB?.uniqueItems?.length || 5) * 4 + 38));
  }

  return normalized;
}

// Server-side category enforcement — remove items clearly outside the category
function enforceCategory(items, category) {
  const offCategoryKeywords = {
    "Food & Beverage": ["bank", "fintech", "insurance", "loan", "credit", "mortgage", "investment", "telecom", "mobile network", "fashion", "clothing", "hospital", "pharma", "car manufacturer", "automobile"],
    "Technology": ["restaurant", "food brand", "beverage", "brewery", "bank branch", "fashion house", "clothing brand", "car dealership"],
    "Finance & Fintech": ["restaurant", "food brand", "beverage", "clothing", "fashion", "hospital", "car manufacturer"],
    "Healthcare": ["restaurant", "food brand", "beverage", "bank", "clothing", "fashion", "car manufacturer"],
    "Automotive": ["restaurant", "food brand", "beverage", "bank", "clothing", "fashion", "hospital"],
    "Fashion & Beauty": ["bank", "restaurant", "beverage", "hospital", "car manufacturer", "fintech"],
    "Retail & E-commerce": ["bank", "hospital", "car manufacturer", "pharmaceutical"],
    "Entertainment & Media": ["bank", "hospital", "car manufacturer", "pharmaceutical", "food manufacturer"],
    "Education": ["bank", "hospital", "car manufacturer", "food brand", "beverage", "fashion"],
    "Agriculture & Food Tech": ["bank", "fashion", "car manufacturer", "entertainment"],
    "Energy & CleanTech": ["bank", "fashion", "food brand", "restaurant", "entertainment"],
    "Real Estate": ["food brand", "beverage", "fashion", "entertainment", "hospital"]
  };

  const blockedKeywords = offCategoryKeywords[category] || [];
  if (blockedKeywords.length === 0) return items;

  return items.filter(item => {
    const nameAndDesc = `${item.name} ${item.description} ${item.about} ${item.type}`.toLowerCase();
    const isOffCategory = blockedKeywords.some(kw => nameAndDesc.includes(kw));
    return !isOffCategory;
  });
}

function filterItems(items) {
  const seen = new Set();
  const hardBlocklist = [
    "coca-cola", "pepsi", "mcdonald's", "mcdonalds", "kfc", "pizza hut",
    "starbucks", "subway", "burger king", "nestle", "unilever", "apple inc",
    "google", "microsoft", "amazon", "netflix", "uber", "facebook", "meta"
  ];
  return items.filter(item => {
    if (!item.name) return false;
    const key = item.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    if (hardBlocklist.some(b => key === b)) return false;
    return true;
  });
}

function addAffiliateLinks(items) {
  return items.map(item => {
    if (item.amazonSearch && item.amazonSearch !== "N/A") {
      const q = encodeURIComponent(item.amazonSearch);
      item.amazonLink = `https://www.amazon.com/s?k=${q}&tag=${AMAZON_AFFILIATE_TAG}`;
    } else {
      item.amazonLink = null;
    }
    return item;
  });
}

function addImages(items) {
  return items.map(item => {
    let logoUrl = null;
    if (item.website && item.website !== "N/A") {
      try {
        const domain = new URL(item.website).hostname.replace("www.", "");
        logoUrl = `https://logo.clearbit.com/${domain}`;
      } catch {}
    }
    const initials = item.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=1a1f2e&color=e8ff47&size=200&bold=true&font-size=0.4&format=svg`;
    item.imageUrl = logoUrl || fallbackUrl;
    item.imageFallback = fallbackUrl;
    return item;
  });
}

app.post("/api/compare", async (req, res) => {
  const { countryA, countryB, category } = req.body;

  if (!countryA || !countryB || !category) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const ctx = CATEGORY_CONTEXT[category] || {
    includes: `products and services in the ${category} sector`,
    excludes: "banks, food brands, fashion, automotive, healthcare unrelated to this category"
  };

  const systemPrompt = `You are a global market intelligence expert identifying products, brands, and services exclusive to specific countries.

CRITICAL CATEGORY RULE — THIS IS THE MOST IMPORTANT RULE:
The user selected the category: "${category}"
You MUST ONLY return items that belong to the "${category}" category.
✅ ONLY include: ${ctx.includes}
❌ NEVER include: ${ctx.excludes}

If an item does not clearly belong to "${category}", DO NOT include it. It is better to return fewer items than to include off-category items.

OTHER RULES:
- Return exactly 15 items per country, all within the "${category}" category
- Every item must be a real, verifiable company or product
- Items must be exclusive to that country — not widely available in the other
- Use EXACTLY "countryA" and "countryB" as JSON keys
- opportunityScore must be an integer between 45 and 95
- Return raw JSON only`;

  const userPrompt = `Compare the "${category}" sector ONLY between ${countryA} and ${countryB}.

IMPORTANT: Every single item you return must be in the "${category}" category.
✅ Only include: ${ctx.includes}
❌ Do NOT include: ${ctx.excludes}

Think about these specific "${category}" sub-categories to find 15 items per country:
${ctx.includes}

Return exactly this JSON structure:

{
  "countryA": {
    "name": "${countryA}",
    "flag": "${getFlag(countryA)}",
    "uniqueItems": [
      {
        "name": "Real ${category} company or product name",
        "type": "Product | Service | Platform | Innovation | Brand",
        "description": "2-3 sentences about this ${category} company/product with specific real facts",
        "about": "Detailed paragraph: founding, market position, user base, why not in ${countryB}",
        "founded": "Year e.g. 2012",
        "website": "https://realwebsite.com or N/A",
        "contact": "contact@company.com or phone or N/A",
        "headquarters": "City, ${countryA}",
        "marketSize": "$Xbn or $Xm or N/A",
        "whyNotInOther": "Specific reason why not in ${countryB}",
        "amazonSearch": "Amazon search query for similar product or N/A if not physical",
        "category": "${category}",
        "tags": ["tag1", "tag2", "tag3"]
      }
    ]
  },
  "countryB": {
    "name": "${countryB}",
    "flag": "${getFlag(countryB)}",
    "uniqueItems": [
      {
        "name": "Real ${category} company or product name",
        "type": "Product | Service | Platform | Innovation | Brand",
        "description": "2-3 sentences with specific real facts",
        "about": "Detailed paragraph",
        "founded": "Year",
        "website": "https://realwebsite.com or N/A",
        "contact": "contact or N/A",
        "headquarters": "City, ${countryB}",
        "marketSize": "$ estimate or N/A",
        "whyNotInOther": "Specific reason why not in ${countryA}",
        "amazonSearch": "Amazon search query or N/A",
        "category": "${category}",
        "tags": ["tag1", "tag2", "tag3"]
      }
    ]
  },
  "insights": {
    "summary": "3-4 sentences comparing the ${category} markets in ${countryA} vs ${countryB}",
    "opportunityScore": {
      "countryA": 72,
      "countryB": 58
    },
    "keyDifferences": ["difference 1", "difference 2", "difference 3", "difference 4", "difference 5"],
    "entrepreneurOpportunity": "Specific actionable paragraph about ${category} gaps and opportunities"
  }
}

Remember: ONLY "${category}" items. 15 per country.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    });

    const text = completion.choices[0].message.content.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    const rawData = JSON.parse(clean);

    const data = normalizeResponse(rawData, countryA, countryB);

    if (data.countryA?.uniqueItems) {
      data.countryA.uniqueItems = addImages(addAffiliateLinks(
        enforceCategory(filterItems(data.countryA.uniqueItems), category)
      ));
    }
    if (data.countryB?.uniqueItems) {
      data.countryB.uniqueItems = addImages(addAffiliateLinks(
        enforceCategory(filterItems(data.countryB.uniqueItems), category)
      ));
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate comparison", details: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MarketGap server running on port ${PORT}`));
