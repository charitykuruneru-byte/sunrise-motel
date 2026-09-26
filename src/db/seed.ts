import { db } from "@/db";
import { galleryImagesTable, menuItemsTable, postsTable, roomTypesTable } from "@/db/schema";

/**
 * Seeds rooms, gallery, menu and posts if the room catalogue is empty.
 * Room photos are the public listing photographs of Sunrise Motel (Lilongwe).
 * Food / event / lounge photos are illustrative and can be replaced from Admin → Pictures.
 */
export async function seedDatabaseIfEmpty() {
  try {
    const existingRooms = await db.select().from(roomTypesTable).limit(1);
    if (existingRooms.length > 0) return;

    await db.insert(roomTypesTable).values([
      {
        id: "standard",
        name: "The Standard",
        slug: "standard",
        description: "An easy, restful room for short city stays: queen bed, hot shower, work surface, fresh linen and fast Wi-Fi.",
        rate: 85000,
        totalInventory: 4,
        bed: "Queen bed",
        sleeps: "Sleeps 2",
        size: "24 m²",
        badge: "Classic comfort",
        features: JSON.stringify(["Fast Wi-Fi / Starlink", "Hot water & walk-in shower", "Flat-screen TV", "Daily housekeeping", "Secure on-site parking"]),
        images: JSON.stringify(["/images/hero-standard.jpg", "/images/deluxe-detail.jpg", "/images/listing-11.jpg", "/images/bathroom.jpg", "/images/room-layout.jpg"]),
        isActive: true,
      },
      {
        id: "deluxe",
        name: "The Deluxe",
        slug: "deluxe",
        description: "A spacious king room for business travellers and slow weekends, with a proper desk, tea & coffee station and extra room to breathe.",
        rate: 125000,
        totalInventory: 3,
        bed: "King bed",
        sleeps: "Sleeps 2 adults",
        size: "32 m²",
        badge: "Guest favourite",
        features: JSON.stringify(["King bed & premium pillows", "Dedicated work desk", "Fast Wi-Fi / Starlink", "En-suite bathroom", "Tea & coffee station", "Breakfast option"]),
        images: JSON.stringify(["/images/deluxe-main.jpg", "/images/deluxe-bed.jpg", "/images/deluxe-room.jpg", "/images/deluxe-detail.jpg", "/images/listing-12.jpg", "/images/bathroom.jpg"]),
        isActive: true,
      },
      {
        id: "twin",
        name: "The Twin",
        slug: "twin",
        description: "Two proper single beds and generous floor space for colleagues, friends or family travelling together.",
        rate: 115000,
        totalInventory: 3,
        bed: "Twin single beds",
        sleeps: "Sleeps 2",
        size: "30 m²",
        badge: "Colleagues & family",
        features: JSON.stringify(["Two comfortable single beds", "Fast Wi-Fi", "Writing desk & chair", "En-suite private bathroom", "Secure parking included"]),
        images: JSON.stringify(["/images/twin-main.jpg", "/images/twin-view.jpg", "/images/twin-setup.jpg", "/images/room-layout.jpg", "/images/bathroom.jpg"]),
        isActive: true,
      },
    ]);

    await db.insert(postsTable).values([
      { id: "post-1", title: "Sunset Happy Hour", category: "Event", day: "THU", date: "24", time: "17:00 — 19:00", detail: "House pours, chilled drinks and good conversation on the terrace as the sun goes down.", priceTag: "Special drink prices", imageUrl: "/images/happy-hour-terrace.jpg", isActive: true },
      { id: "post-2", title: "Lawn Braai & Sizzling Cuts", category: "Special", day: "SAT", date: "26", time: "12:00 — 20:00", detail: "Tender grilled beef and chicken, spicy house relish, roasted maize and cold drinks on the lawn.", priceTag: "Plates from MWK 22,000", imageUrl: "/images/braai-lawn.jpg", isActive: true },
      { id: "post-3", title: "Match Day on the Big Screen", category: "Event", day: "SUN", date: "27", time: "15:00 onwards", detail: "Live football on the big screen with sharing platters and drinks-bucket specials.", priceTag: "Free entry for diners", imageUrl: "/images/match-day.jpg", isActive: true },
      { id: "post-4", title: "Work & Relax Day Pass", category: "Offer", day: "DAILY", date: "ALL", time: "07:00 — 21:00", detail: "Starlink Wi-Fi, bottomless filter coffee, desk power and 15% off kitchen meals for the day.", priceTag: "MWK 9,500 / day", imageUrl: "/images/workspace-coffee.jpg", isActive: true },
      { id: "post-5", title: "Garden Dinner Evenings", category: "Event", day: "FRI", date: "25", time: "18:30 — 22:00", detail: "Candle-lit garden tables, grilled chambo and the week's slow-cooked special under the string lights.", priceTag: "Reserve a table", imageUrl: "/images/garden-dinner.jpg", isActive: true },
    ]);

    await db.insert(menuItemsTable).values([
      { id: "menu-1", name: "Sunrise Signature Grill Platter", category: "From the grill", description: "Beef skewers, grilled chicken wings, golden chips, seasonal greens and our peri relish.", price: 28000, imageUrl: "/images/food-grill.jpg", isAvailable: true, isSpecial: true },
      { id: "menu-2", name: "Nsima with Beef Stew & Greens", category: "Mains", description: "Soft nsima, slow-cooked beef in tomato-onion gravy and sautéed pumpkin leaves. The house classic.", price: 9500, imageUrl: "/images/food-nsima-beef.jpg", isAvailable: true, isSpecial: true },
      { id: "menu-3", name: "Grilled Chambo, Chips & Salad", category: "From the grill", description: "Whole grilled chambo with lemon, crispy chips and a fresh tomato-onion salad.", price: 16000, imageUrl: "/images/food-chambo.jpg", isAvailable: true, isSpecial: false },
      { id: "menu-4", name: "Slow-Cooked Beef Curry", category: "Mains", description: "Rich, aromatic beef curry with garden vegetables, served with steamed rice or nsima.", price: 18500, imageUrl: "/images/food-curry.jpg", isAvailable: true, isSpecial: false },
      { id: "menu-5", name: "Area 5 Garden Crunch Salad", category: "Light & fresh", description: "Crisp greens, feta, cucumber and roasted peppers in a lemon-herb dressing.", price: 12000, imageUrl: "/images/food-salad.jpg", isAvailable: true, isSpecial: false },
      { id: "menu-6", name: "Full Sunrise Breakfast", category: "Breakfast", description: "Eggs your way, beef sausage, baked beans, toast, grilled tomato and Malawian tea or coffee.", price: 14000, imageUrl: "/images/breakfast-full.jpg", isAvailable: true, isSpecial: false },
      { id: "menu-7", name: "Light Breakfast Plate", category: "Breakfast", description: "Toast, eggs, fruit and a fresh cup of filter coffee — quick and light before the road.", price: 8500, imageUrl: "/images/breakfast-plate.jpg", isAvailable: true, isSpecial: false },
      { id: "menu-8", name: "Filter Coffee & Espresso", category: "Coffee & snacks", description: "Freshly roasted Malawian beans as Americano, cappuccino or iced latte.", price: 4500, imageUrl: "/images/breakfast-coffee.jpg", isAvailable: true, isSpecial: false },
      { id: "menu-9", name: "Chilled Juices & Soft Drinks", category: "Drinks", description: "Cold sodas, sparkling water and freshly squeezed citrus juice.", price: 3500, imageUrl: "/images/drinks-poolside.jpg", isAvailable: true, isSpecial: false },
    ]);

    await db.insert(galleryImagesTable).values([
      { id: "gal-01", title: "Standard Room", category: "Rooms", imageUrl: "/images/hero-standard.jpg", altText: "Sunrise Motel standard room with queen bed", caption: "Clean, comfortable accommodation in Area 5", displayOrder: 1 },
      { id: "gal-02", title: "Deluxe King Room", category: "Rooms", imageUrl: "/images/deluxe-main.jpg", altText: "Sunrise Motel deluxe king room", caption: "King bed, work desk and en-suite bathroom", displayOrder: 2 },
      { id: "gal-03", title: "Twin Room", category: "Rooms", imageUrl: "/images/twin-main.jpg", altText: "Sunrise Motel twin room with two beds", caption: "Two proper single beds for colleagues or friends", displayOrder: 3 },
      { id: "gal-04", title: "Deluxe — Bed Detail", category: "Rooms", imageUrl: "/images/deluxe-bed.jpg", altText: "Deluxe room bed and linen", caption: "Fresh linen and premium pillows", displayOrder: 4 },
      { id: "gal-05", title: "Twin — Window View", category: "Rooms", imageUrl: "/images/twin-view.jpg", altText: "Twin room by the window", caption: "Bright, airy and quiet", displayOrder: 5 },
      { id: "gal-06", title: "En-suite Bathroom", category: "Rooms", imageUrl: "/images/bathroom.jpg", altText: "Private bathroom with hot shower", caption: "Private bathroom with 24/7 hot water", displayOrder: 6 },
      { id: "gal-07", title: "Room Layout", category: "Rooms", imageUrl: "/images/room-layout.jpg", altText: "Room layout with desk", caption: "Space to work and unwind", displayOrder: 7 },
      { id: "gal-08", title: "Room Interior", category: "Rooms", imageUrl: "/images/listing-11.jpg", altText: "Sunrise Motel room interior", caption: "Comfort in every detail", displayOrder: 8 },
      { id: "gal-09", title: "Room Interior II", category: "Rooms", imageUrl: "/images/listing-12.jpg", altText: "Sunrise Motel room interior", caption: "Rest well, wake up easy", displayOrder: 9 },
      { id: "gal-10", title: "Welcome Desk", category: "Property", imageUrl: "/images/reception.jpg", altText: "Reception desk with warm lighting", caption: "24-hour front desk — when you are here, you are family", displayOrder: 10 },
      { id: "gal-11", title: "Lounge Lights", category: "Property", imageUrl: "/images/lobby-lights.jpg", altText: "Lounge with warm hanging lights", caption: "Warm evenings in the lounge", displayOrder: 11 },
      { id: "gal-12", title: "Courtyard", category: "Property", imageUrl: "/images/courtyard.jpg", altText: "Outdoor courtyard", caption: "Open-air courtyard for drinks and conversation", displayOrder: 12 },
      { id: "gal-13", title: "Garden Seating", category: "Property", imageUrl: "/images/garden-seating.jpg", altText: "Garden seating with greenery", caption: "Shaded garden seating", displayOrder: 13 },
      { id: "gal-14", title: "Night Terrace", category: "Property", imageUrl: "/images/night-terrace.jpg", altText: "Terrace at night with lights", caption: "The terrace after dark", displayOrder: 14 },
      { id: "gal-15", title: "Signature Grill Platter", category: "Dining", imageUrl: "/images/food-grill.jpg", altText: "Grilled meat platter", caption: "From the grill, served daily", displayOrder: 15 },
      { id: "gal-16", title: "Nsima & Beef Stew", category: "Dining", imageUrl: "/images/food-nsima-beef.jpg", altText: "Nsima with beef stew and greens", caption: "The house classic", displayOrder: 16 },
      { id: "gal-17", title: "Grilled Chambo", category: "Dining", imageUrl: "/images/food-chambo.jpg", altText: "Grilled chambo fish with chips", caption: "Fresh chambo, chips and salad", displayOrder: 17 },
      { id: "gal-18", title: "Full Breakfast", category: "Dining", imageUrl: "/images/breakfast-full.jpg", altText: "Full breakfast plate", caption: "Breakfast from 07:00", displayOrder: 18 },
      { id: "gal-19", title: "Beef Curry", category: "Dining", imageUrl: "/images/food-curry.jpg", altText: "Slow-cooked beef curry", caption: "Slow-cooked comfort", displayOrder: 19 },
      { id: "gal-20", title: "Cold Drinks", category: "Dining", imageUrl: "/images/drinks-poolside.jpg", altText: "Cold drinks and snacks", caption: "Something cold for the afternoon", displayOrder: 20 },
      { id: "gal-21", title: "Lawn Braai", category: "Events", imageUrl: "/images/braai-lawn.jpg", altText: "Weekend braai on the lawn", caption: "Saturday braai on the lawn", displayOrder: 21 },
      { id: "gal-22", title: "Happy Hour", category: "Events", imageUrl: "/images/happy-hour-terrace.jpg", altText: "Happy hour drinks on the terrace", caption: "Sunset happy hour", displayOrder: 22 },
      { id: "gal-23", title: "Garden Dinner", category: "Events", imageUrl: "/images/garden-dinner.jpg", altText: "Garden dinner under string lights", caption: "Friday garden dinners", displayOrder: 23 },
      { id: "gal-24", title: "Work Corner", category: "Work", imageUrl: "/images/workspace-coffee.jpg", altText: "Laptop and coffee by the window", caption: "Coffee, power and Starlink Wi-Fi", displayOrder: 24 },
    ]);
  } catch (error) {
    console.error("Seeding error:", error);
  }
}
