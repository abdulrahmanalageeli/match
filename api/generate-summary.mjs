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

  const messages = [
    {
      role: "system",
      content:
        "You're a friendly and insightful AI that summarizes personality form answers into a warm, brief (max 80 words) description.",
    },
    {
      role: "user",
      content: `Form responses:\n${JSON.stringify(responses, null, 2)}`,
    },
  ]

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
    })

    const summary = completion.choices?.[0]?.message?.content?.trim()

    if (!summary) {
      throw new Error("No summary returned from GPT.")
    }

    return res.status(200).json({ summary })
  } catch (err) {
    console.error("GPT API Error:", err)
    return res.status(500).json({ error: err.message || "Failed to get summary." })
  }
}
