const API_URL = "https://fadila-barber.onrender.com/api";
/* ===============================
   DOM ELEMENTS
=================================*/

const bookingForm = document.getElementById("bookingForm");
const dateInput = document.getElementById("date");
const timeSelect = document.getElementById("time");
const serviceSelect = document.getElementById("service");
const messageBox = document.getElementById("messageBox");
const priceDisplay = document.getElementById("servicePriceDisplay");

/* ===============================
   INIT AFTER DOM LOAD
=================================*/

document.addEventListener("DOMContentLoaded", () => {

  loadServices();

  // ✅ Flatpickr במקום input רגיל
  flatpickr(dateInput, {
    locale: "he",
    dateFormat: "Y-m-d",
    minDate: "today",
    defaultDate: "today", // בוחר אוטומטית היום
    disableMobile: true,
    onReady: function(selectedDates, dateStr) {
      if (dateStr) {
        loadAvailableTimes(); // ✅ טוען שעות ישר
      }
    },

    onChange: function(selectedDates, dateStr) {
      if (dateStr) {
        loadAvailableTimes();
      }
    }
  });

  serviceSelect.addEventListener("change", showServicePrice);
  bookingForm.addEventListener("submit", submitBooking);
});

/* ===============================
   LOAD SERVICES FROM DATABASE
=================================*/

async function loadServices() {
  try {
    const res = await fetch(`${API_URL}/services`);
    const services = await res.json();

    serviceSelect.innerHTML = '<option value="">בחר שירות...</option>';

    services.forEach(service => {
      const option = document.createElement("option");
      option.value = service.name;
      option.textContent = service.name;
      option.dataset.price = service.price;
      option.dataset.duration = service.duration;
      serviceSelect.appendChild(option);
    });

  } catch (error) {
    console.error("Error loading services:", error);
  }
}

/* ===============================
   SHOW PRICE WHEN SERVICE SELECTED
=================================*/

function showServicePrice() {
  const selected = serviceSelect.options[serviceSelect.selectedIndex];
  const price = selected.dataset.price;

  if (price) {
    priceDisplay.textContent = `מחיר: ₪${price}`;
  } else {
    priceDisplay.textContent = "";
  }
}

/* ===============================
   LOAD AVAILABLE TIMES
=================================*/

async function loadAvailableTimes() {

  const date = dateInput.value;
  const service = serviceSelect.value;

  if (!date || !service) return;

  timeSelect.disabled = true;
  timeSelect.innerHTML = "<option>טוען...</option>";

  try {

    const res = await fetch(
      `${API_URL}/appointments/available/${date}?service=${service}`
    );

    const data = await res.json();

    timeSelect.innerHTML = "";

    if (!data.availableSlots || data.availableSlots.length === 0) {
      timeSelect.innerHTML = "<option>אין שעות פנויות</option>";
      timeSelect.disabled = true;
    } else {
      timeSelect.innerHTML = '<option value="">בחר שעה...</option>';

      data.availableSlots.forEach(slot => {
        const option = document.createElement("option");
        option.value = slot;
        option.textContent = slot;
        timeSelect.appendChild(option);
      });

      timeSelect.disabled = false;
    }

  } catch (error) {
    console.error("Error loading available times:", error);
  }
}

/* ===============================
   SUBMIT BOOKING
=================================*/

async function submitBooking(e) {
  e.preventDefault();

  const data = {
    customerName: document.getElementById("name").value.trim(),
    customerPhone: document.getElementById("phone").value.trim(),
    service: serviceSelect.value,
    date: dateInput.value,
    time: timeSelect.value
  };

  if (!data.customerName || !data.customerPhone || !data.service || !data.date || !data.time) {
    showMessage("יש למלא את כל השדות", "error");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await res.json();

    if (res.ok) {
      localStorage.setItem("bookingSuccess", "✅ התור שלך נקבע בהצלחה! נתראה בקרוב 💈");
      bookingForm.reset();
      priceDisplay.textContent = "";
      timeSelect.disabled = true;
      window.location.href = "gallery.html";
    } else {
      showMessage(result.error || "שגיאה בקביעת תור", "error");
    }

  } catch (error) {
    showMessage("שגיאת חיבור לשרת", "error");
  }
}

/* ===============================
   MESSAGE HELPER
=================================*/

function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.className = type;
}