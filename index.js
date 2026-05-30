import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = 3000;
const openLibraryUrl = "https://covers.openlibrary.org/b/isbn/";

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "booknotes",
  password: process.env.databasePassword,
  port: 5432,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const books = [];

async function getBooks() {
  try {
    const result = await db.query("SELECT * FROM books");

    const books = result.rows.map((book) => {
      return {
        ...book,
        formatted_date: new Date(book.date_read).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        cover_url: `${openLibraryUrl}${book.isbn}-L.jpg`,
      };
    });

    return books;
  } catch (err) {
    console.error(err);
    throw new Error("Error fetching books");
  }
}

app.get("/", async (req, res) => {
  const books = await getBooks();
  const bookCount = books.length;
  const reviews = await db.query(`
      SELECT COUNT(*) 
      FROM books
      WHERE notes IS NOT NULL
      AND TRIM(notes) != ''
  `);
  const aveRatings = await db.query(`
      SELECT AVG(rating) 
      FROM books
      WHERE rating IS NOT NULL
  `);
  const averageRating =
    aveRatings.rows[0].avg === null
      ? "0.0"
      : Number(aveRatings.rows[0].avg).toFixed(1);

  res.render("index.ejs", { books: books, bookCount: bookCount, reviewCount: reviews.rows[0].count, averageRating: averageRating });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});