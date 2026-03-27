const url = "https://universatv.uazapi.com/send/text";
const apikey = "00acf574-5d6d-45f1-a287-695c1f660f53";

const body = {
  number: "554796360859",
  text: "Teste Automático Vercel 4"
};

async function test() {
  console.log('Sending to:', url);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token: apikey
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  console.log('Status:', response.status);
  console.log('Body:', raw);
}

test();
