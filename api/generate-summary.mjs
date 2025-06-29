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
      .map(([_, value]) => `- ${value}`)
      .join("\n")

    const completion = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
      messages: [
        {
          role: "system",
          content: `
أنت مساعد ذكي يتكلم باللهجة السعودية العادية، وتكتب بصيغة المتكلم كأنك تكلّم الشخص مباشرة، لكن بأسلوب محترم وهادئ. لا تستخدم كلمات إنجليزية ولا لهجة مبالغ فيها، وخلّك واضح ومفهوم. هدفك إنك تلخّص شخصية الشخص هذا من خلال إجاباته، وتحاول توصّف له نفسه بشكل صادق، مختصر، وبدون مبالغة.

لا تكون رسمي بزيادة ولا كأنك صديق مقرّب، خلك بالنص. لازم ما تتعدى ٨٠ كلمة.
        `.trim(),
        },
        {
          role: "user",
          content: `هاذي الإجابات اللي كتبها:\n${prompt}`,
        },
      ],
    })

    const summary = completion.choices?.[0]?.message?.content?.trim()
    console.log("GPT Response:", summary)

    if (!summary) {
      return res.status(200).json({ summary: "ما طلع ملخص من GPT." })
    }

    return res.status(200).json({ summary })
  } catch (error) {
    console.error("GPT API Error:", error)
    return res.status(500).json({ error: error.message || "Unexpected error" })
  }
}
