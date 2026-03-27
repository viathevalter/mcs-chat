const url = "https://mcs-chat.vercel.app/api/chat/send";

const conversationId = "d0200ee5-13ab-4346-9abf-68adb3f0d877";

async function test() {
  console.log('Sending message to Vercel API...');
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      conversationId: conversationId,
      text: "Teste Automático Vercel Terminal"
    })
  });

  const txt = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Response: ${txt}`);
}
test();
