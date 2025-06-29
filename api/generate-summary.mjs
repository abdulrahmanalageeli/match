import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }

  const { responses } = req.body

  if (!responses || typeof responses !== "object") {
    return res.status(400).json({ error: "Invalid request body" })
  }

  try {
    const prompt = Object.entries(responses)
      .map(([key, value]) => `- ${value}`)
      .join("\n")

    const completion = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: [
        {
          role: "system",
          content:
            "You summarize personality forms in under 80 words. Make it insightful, friendly, and sound human.",
        },
        {
          role: "user",
          content: `Here are the answers:\n${prompt}`,
        },
      ],
    })

    const summary = completion.choices?.[0]?.message?.content?.trim()
    console.log("GPT Response:", summary)

    if (!summary) {
      return res.status(200).json({ summary: "GPT returned no summary." })
    }

    return res.status(200).json({ summary })
  } catch (error) {
    console.error("GPT API Error:", error)
    return res.status(500).json({ error: error.message || "Unexpected error" })
  }
}
