export const handler = async (event: any) => {
  const station = event.queryStringParameters?.station || 'groovesalad';
  const apiUrl = `https://api.somafm.com/channels/${station}.json`;

  const response = await fetch(apiUrl);
  const data = await response.text();

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
    body: data,
  };
};
