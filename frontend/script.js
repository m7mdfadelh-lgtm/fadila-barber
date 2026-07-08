// ✅ تم التحديث ليرتبط بسيرفر Railway الجديد 24/7
const API_URL = "railway-deploy-production-adc6.up.railway.app/api";

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

  // 1. جلب الخدمات أولاً من قاعدة البيانات
  loadServices();

  // 2. إعداد مكتبة تحديد التاريخ Flatpickr
  flatpickr(dateInput, {
    locale: "he",
    dateFormat: "Y-m-d",
    minDate: "today",
    defaultDate: "today", 
    disableMobile: true,
    onReady: function(selectedDates, dateStr) {
      if (dateStr) {
        loadAvailableTimes(); 
      }
    },
    onChange: function(selectedDates, dateStr) {
      if (dateStr) {
        loadAvailableTimes();
      }
    }
  });

  // 3. أحداث التغيير والإرسال
  serviceSelect.addEventListener("change", () => {
    showServicePrice();
    loadAvailableTimes(); // ✅ جلب الساعات فور اختيار الخدمة أو تغييرها
  });

//   if (bookingForm) {
//     bookingForm.addEventListener("submit", submitBooking);
//  }
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
  if (!selected) return;
  
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

  // إذا لم يتم تحديد التاريخ والخدمة معاً، انتظر ولا تفعل شيئاً
  if (!date || !service) return;

  timeSelect.disabled = true;
  timeSelect.innerHTML = "<option>טוען...</option>";

  try {
    const res = await fetch(
      `${API_URL}/appointments/available/${date}?service=${encodeURIComponent(service)}`
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
    timeSelect.innerHTML = "<option>שגיאה בטעינת השעות</option>";
  }
}

/* ===============================
   SUBMIT BOOKING
=================================*/
async function submitBooking(e) {
  if(e) e.preventDefault();

  const data = {
    customerName: document.getElementById("name").value.trim(),
    customerPhone: document.getElementById("phone").value.trim(),
    service: serviceSelect.value,
    date: dateInput.value,
    time: timeSelect.value
  };

  if (!data.customerName || !data.customerPhone || !data.service || !data.date || !data.time) {
    showMessage("יש למלא את كل השדות", "error");
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

    if (res.ok) {
      localStorage.setItem("bookingSuccess", "✅ התור שלך נקבע בהצלحة! נתראה בקרוב 💈");
      
      if (bookingForm) bookingForm.reset();
      if (priceDisplay) priceDisplay.textContent = "";
      if (timeSelect) timeSelect.disabled = true;

      console.log("Booking successful! Redirecting...");

// 🔹 هذا السطر يقرأ الرابط الحالي الذي تقف عليه الصفحة ويستبدل فقط اسم الملف بـ gallery.html
// مما يضمن عمله محلياً بـ serve وعلى GitHub Pages بشكل ديناميكي 100%
const currentPath = window.location.pathname;
const newPath = currentPath.substring(0, currentPath.lastIndexOf('/')) + '/gallery.html';
window.location.href = window.location.origin + newPath;
      
    } else {
      const result = await res.json().catch(() => ({}));
      showMessage(result.error || "שגיאה בקביעת תור", "error");
    }

  } catch (error) {
    console.error("An error occurred during booking:", error);
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