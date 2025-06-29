import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end("Only POST allowed")
  }

  const { responses } = req.body

  const messages = [
    {
      role: "system",
      content: "You're an AI that summarizes personality forms in a friendly, professional tone under 80 words.",
    },
    {
      role: "user",
      content: `Summarize this personality form:\n${JSON.stringify(responses)}`,
    },
  ]

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
    })

    const summary = completion.choices[0].message.content
    res.status(200).json({ summary })
  } catch (error) {
    console.error("OpenAI Error:", error)
    res.status(500).json({ error: error.message || "GPT error" })
  }
}
