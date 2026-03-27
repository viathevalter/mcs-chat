async function test() {
  const payload = {
    event: "messages.upsert",
    instance: "wiseowe",
    data: {
      key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "TEST_12345" },
      pushName: "Valter Teste Manual",
      messageType: "conversation",
      message: { conversation: "Oi Teste Vercel via Script" }
    }
  }
  const r = await fetch("https://mcs-chat.vercel.app/api/webhooks/evolution/wiseowe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  console.log(r.status, await r.text());
}
test();
