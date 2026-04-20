export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  // Replace this sample auth logic with your real backend auth integration.
  const role = email.includes("owner")
    ? "owner"
    : email.includes("kitchen")
    ? "kitchen"
    : email.includes("staff")
    ? "staff"
    : "customer";

  return res.status(200).json({
    token: `demo-token-${Date.now()}`,
    user: { email, role },
  });
}
