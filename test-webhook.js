async function test() {
  const payload = {
    event: "messages.upsert",
    instance: "stocco",
    data: {
      key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "TEST_" + Date.now() },
      pushName: "Valter Teste Script",
      messageType: "conversation",
      message: { conversation: "Oi Teste Stocco" }
    }
  }
  const r = await fetch("https://mcs-chat.vercel.app/api/webhooks/evolution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  console.log(r.status, await r.text());
}
test();
