import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `你是投資組合風險分析助理。你只能根據使用者提供的投資組合資料，進行教育性、資訊性、結構化分析。

重要限制：
- 不得提供個別股票的買進、賣出、持有建議。
- 不得提供目標價、預測報酬、保證獲利、明確交易指令。
- 不得要求使用者加碼、減碼或立即交易。
- 可以分析：市場配置、持股集中度、匯率曝險、未實現損益來源、股利收入、波動與回撤風險、再平衡觀察、後續追蹤指標。
- 回覆必須使用繁體中文。
- 回覆開頭必須聲明：以下內容僅供資訊與教育用途，不構成投資建議。
- 若資料不足，請明確列出資料限制。

請用以下格式回覆：
### 1. 投資組合摘要
### 2. 主要風險觀察
### 3. 集中度與配置分析
### 4. 匯率曝險分析
### 5. 損益與趨勢觀察
### 6. 後續可追蹤事項
### 7. 資料限制與免責聲明`;

function getAzureConfig() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

  if (!endpoint || !apiKey || !deployment) {
    return { error: "Missing Azure OpenAI environment variables" };
  }

  const cleanEndpoint = endpoint.replace(/\/$/, "");
  const url = `${cleanEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  return { url, apiKey };
}

export async function POST(request: Request) {
  try {
    const config = getAzureConfig();
    if ("error" in config) {
      return NextResponse.json({ error: config.error }, { status: 500 });
    }

    const body = await request.json();
    const portfolio = body?.portfolio;

    if (!portfolio) {
      return NextResponse.json({ error: "portfolio is required" }, { status: 400 });
    }

    const userPrompt = `請根據以下投資組合資料進行分析。請注意：只能做風險、配置、集中度、匯率曝險、趨勢與追蹤事項分析，不得提供買進、賣出、持有或目標價建議。\n\n投資組合資料 JSON：\n${JSON.stringify(portfolio, null, 2)}`;

    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": config.apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 1800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Azure OpenAI error ${response.status}: ${errorText}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const analysis = data?.choices?.[0]?.message?.content || "未取得分析結果。";

    return NextResponse.json({ analysis });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "AI portfolio analysis failed" },
      { status: 500 }
    );
  }
}
