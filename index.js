const line = require("@line/bot-sdk");
const express = require("express");
const axios = require("axios").default;
const dotenv = require("dotenv");

dotenv.config();
const app = express();

const lineConfig = {
  channelAccessToken: process.env.ACCESS_TOKEN,
  channelSecret: process.env.SECRET_TOKEN,
};

const client = new line.Client(lineConfig);

// RAWG API Key (ต้องสร้าง API key บน https://rawg.io/apidocs)
const RAWG_API_KEY = process.env.RAWG_API_KEY;

// กำหนดสถานะการสนทนา
const userState = {};  // อาจจะใช้ session หรือฐานข้อมูลเพื่อรองรับการใช้งานพร้อมกัน

app.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    console.log("events=>>>>", events);
    if (events.length > 0) {
      await Promise.all(events.map((item) => handleEvent(item)));
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
});

const handleEvent = async (event) => {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userMessage = event.message.text.toLowerCase();
  const userId = event.source.userId;

  // ฟังก์ชันถามเกี่ยวกับเกมยอดนิยมในปีนี้
  if (
    userMessage.includes("เกมยอดนิยมปีนี้") ||
    userMessage.includes("เกมยอดนิยมในปีนี้")
  ) {
    const topGames = await getTopGamesOfTheYear();
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: topGames,
    });
  }

  // ฟังก์ชันแนะนำเกมตามคำสั่ง
  if (userMessage.startsWith("แนะนำเกม")) {
    const query = userMessage.replace("แนะนำเกม", "").trim(); // เอาคำค้นหาเกมจากข้อความ
    const gameResponse = await searchGame(query);
    const replyText =
      gameResponse || "ขออภัย ไม่พบข้อมูลเกี่ยวกับเกมนี้ในระบบ 😔";
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: replyText,
    });
  }

  // ฟังก์ชันแนะนำเกมตามแนวเกมที่พิมพ์เข้ามา
  const genreMap = {
    action: "action",
    rpg: "role-playing-games-rpg",
    fps: "shooter",
    moba: "multiplayer-online-battle-arena",  // รองรับ MOBA
    strategy: "strategy",
    simulation: "simulation",
    sports: "sports",
    puzzle: "puzzle",
    horror: "horror",
    racing: "racing",
  };

  const genre = genreMap[userMessage];

  if (genre) {
    const recommendations = await recommendGamesByGenre(genre); // แนะนำเกมตามแนวที่ผู้ใช้พิมพ์
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: recommendations || "ขออภัย ไม่พบข้อมูลเกมในแนวนี้",
    });
  }

  // คำตอบเริ่มต้น
  return client.replyMessage(event.replyToken, {
    type: "text",
    text: "พิมพ์ 'แนะนำเกม [ชื่อเกม]' เพื่อค้นหาข้อมูลเกม หรือพิมพ์ 'เกมยอดนิยมปีนี้' เพื่อรับคําแนะนำเกม 10 อันดับที่นิยมสูงสุดในปีนี้ หรือพิมพ์ชื่อแนวเกม เช่น 'Action', 'RPG', 'FPS' เพื่อรับคำแนะนำเกมจากแนวนั้นๆ",
  });
};

// Function ค้นหาเกมตามชื่อ
const searchGame = async (query) => {
  try {
    const response = await axios.get(`https://api.rawg.io/api/games`, {
      params: {
        key: RAWG_API_KEY,
        search: query,
      },
    });

    const games = response.data.results;
    if (games.length === 0) return null;

    const topGame = games[0]; // แนะนำเกมตัวแรกจากผลลัพธ์
    return `🎮 ชื่อเกม: ${topGame.name}\n⭐ คะแนน: ${topGame.rating}/5\n📅 วันที่วางจำหน่าย: ${topGame.released}\n\nคุณสามารถดูรายละเอียดเพิ่มเติมได้ที่: ${topGame.website || "ไม่มีเว็บไซต์"}`;
  } catch (error) {
    console.error("Error fetching game data:", error);
    return "เกิดข้อผิดพลาดขณะค้นหาเกม โปรดลองอีกครั้ง";
  }
};

const getTopGamesOfTheYear = async () => {
  const currentYear = new Date().getFullYear(); // ปีปัจจุบัน

  try {
    const response = await axios.get(`https://api.rawg.io/api/games`, {
      params: {
        key: RAWG_API_KEY,
        ordering: "-rating", // จัดอันดับตามคะแนน
        page_size: 10, // จำกัดผลลัพธ์เป็น 10 เกม
        released: `${currentYear}-01-01,${currentYear}-12-31`, // ปีปัจจุบัน
      },
    });

    const games = response.data.results;
    if (games.length === 0) return "ขออภัย ไม่พบข้อมูลเกมยอดนิยมในปีนี้";

    let recommendations = `🎮 10 อันดับเกมยอดนิยมในปี ${currentYear}:\n`;
    games.forEach((game, index) => {
      recommendations += `\n${index + 1}. ${game.name}\n   ⭐ คะแนน: ${game.rating}/5\n   📅 วันที่วางจำหน่าย: ${game.released}\n`;
    });
    return recommendations;
  } catch (error) {
    console.error("Error fetching top games of the year:", error);
    return "เกิดข้อผิดพลาดขณะค้นหาเกมยอดนิยม โปรดลองอีกครั้ง";
  }
};

// Function แนะนำเกมตามแนวเกม
const recommendGamesByGenre = async (genre) => {
  try {
    const response = await axios.get(`https://api.rawg.io/api/games`, {
      params: {
        key: RAWG_API_KEY,
        genres: genre, // ใช้ชื่อแนวเกมที่แมปได้
        ordering: "-rating",
        page_size: 5, // แนะนำ 5 เกม
      },
    });

    const games = response.data.results;
    if (games.length === 0) return `ขออภัย ไม่พบเกมในแนว "${genre}" 😔`;

    let recommendations = `🎮 เกมแนว "${genre}" ที่น่าสนใจ:\n`;
    games.forEach((game, index) => {
      recommendations += `\n${index + 1}. ${game.name}\n   ⭐ คะแนน: ${game.rating}/5\n   📅 วันที่วางจำหน่าย: ${game.released}\n`;
    });
    return recommendations;
  } catch (error) {
    console.error("Error fetching games by genre:", error);
    return "เกิดข้อผิดพลาดขณะค้นหาเกม โปรดลองอีกครั้ง";
  }
};

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(PORT);
  console.log(`listening on port ${PORT}`);
});
