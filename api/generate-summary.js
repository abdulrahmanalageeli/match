const { OpenAI } = require("openai")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end("Only POST allowed")

  const { responses } = req.body

  const messages = [
    {
      role: "system",
      content: "You are a friendly but insightful AI summarizing personality forms.",
    },
    {
      role: "user",
      content: `Summarize this form:\n${JSON.stringify(responses)}\nIn under 80 words.`,
    },
  ]

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
    })

    const summary = completion.choices[0].message.content
    res.status(200).json({ summary })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "OpenAI error" })
  }
}
