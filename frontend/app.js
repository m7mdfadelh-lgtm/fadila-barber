const API_URL=window.FADILA_API_URL;
const el=id=>document.getElementById(id);let currentUser=null,sessionUser=null,customerServices=[],customerAppointments=[],appointmentArchiveTimer=null,selectedFeedbackRating=5,customerFeedback=[],customerFeedbackLoaded=false,customerMessages=[],selectedCustomerMessageIds=new Set();
const token=()=>localStorage.getItem('token');
const api=async(path,options={})=>{options.headers={...(options.headers||{}),...(token()?{Authorization:`Bearer ${token()}`}:{})};const response=await fetch(`${API_URL}${path}`,options);const data=await response.json().catch(()=>({}));if(response.status===401)logout();if(!response.ok)throw new Error(data.error||'حدث خطأ');return data};
function message(id,text,type=''){el(id).textContent=text;el(id).className=`message ${type}`}
async function login(){try{const data=await api('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:el('username').value,password:el('password').value})});localStorage.setItem('token',data.token);sessionUser=data.user;if(data.user.role==='owner'){sessionStorage.setItem('skipDashboardIntro','1');return location.href='dashboard.html'}await showCustomer(data.user)}catch(error){message('loginMessage',error.message,'error')}}
async function syncExistingPushSubscription(){try{if(!token()||!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)||Notification.permission!=='granted')return;const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();if(subscription)await api('/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription})})}catch(error){console.error('Push account sync failed:',error)}}
async function logout(){if(appointmentArchiveTimer){clearTimeout(appointmentArchiveTimer);appointmentArchiveTimer=null}const savedToken=token();try{if(savedToken&&'serviceWorker'in navigator){const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();if(subscription)await fetch(`${API_URL}/push/subscribe`,{method:'DELETE',headers:{Authorization:`Bearer ${savedToken}`,'Content-Type':'application/json'},body:JSON.stringify({endpoint:subscription.endpoint}),keepalive:true})}}catch(error){console.error('Push logout cleanup failed:',error)}finally{localStorage.removeItem('token');location.href='index.html'}}
async function enterApp(){const welcome=el('welcomeView');welcome.classList.add('welcome-leaving');await new Promise(resolve=>setTimeout(resolve,360));welcome.classList.add('hidden');el('appContent').classList.remove('hidden');if(sessionUser){if(sessionUser.role==='owner'){sessionStorage.setItem('skipDashboardIntro','1');return location.href='dashboard.html'}return showCustomer(sessionUser)}el('loginView').classList.remove('hidden')}
async function showCustomer(user){currentUser=user;el('loginView').classList.add('hidden');el('customerView').classList.remove('hidden');el('messagesButton').classList.remove('hidden');el('customerRefreshButton').classList.remove('hidden');el('customerMenuButton').classList.remove('hidden');el('customerDrawerName').textContent=user.name||'';el('customerDrawerPhone').textContent=user.phone||'';el('welcome').textContent=`مرحباً ${user.name}`;await syncExistingPushSubscription();el('feedbackName').value=user.name||'';await Promise.all([loadServices(),loadAppointments(),loadMessages(),loadFeedback(),loadGalleryPreview()]);updateNotificationState();maybeShowFeedbackPrompt()}
async function refreshCustomerData(){const button=el('customerRefreshButton');button.disabled=true;button.classList.add('is-refreshing');try{await Promise.all([loadServices(),loadAppointments(),loadMessages(),loadFeedback(),loadGalleryPreview()]);maybeShowFeedbackPrompt()}catch(error){alert(error.message)}finally{button.disabled=false;button.classList.remove('is-refreshing')}}
function setBookingFormOpen(open){
  const fields=el('bookingFields'),button=el('bookingToggle');
  fields.classList.toggle('hidden',!open);
  button.setAttribute('aria-expanded',String(open));
  button.setAttribute('aria-label',open?'إغلاق نموذج حجز موعد':'فتح نموذج حجز موعد');
  el('bookingToggleHint').textContent=open?'اختر الخدمة والتاريخ والساعة':'اضغط لاختيار الخدمة والتاريخ والساعة';
  el('bookingToggleIcon').textContent=open?'⌃':'⌄';
  el('bookingCard')?.classList.toggle('is-open',open);
}
async function loadServices(){customerServices=await api('/services');el('service').innerHTML='<option value="">اختر خدمة</option>'+customerServices.map(s=>`<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} — ₪${s.price}</option>`).join('')}
function isSafeGalleryImage(value){return /^data:image\/(?:jpe?g|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(String(value||''))}
async function loadGalleryPreview(){
  const section=el('customerGallerySection'),grid=el('customerGalleryPreview');
  if(!section||!grid)return;
  try{
    const images=await api('/gallery');
    const validImages=Array.isArray(images)?images.filter(item=>isSafeGalleryImage(item?.image)):[];
    grid.replaceChildren();
    validImages.slice(0,3).forEach((item,index)=>{
      const image=document.createElement('img');
      image.src=item.image;
      image.alt='صورة '+(index+1)+' من أعمال فاديلا';
      image.loading='lazy';
      image.decoding='async';
      grid.appendChild(image);
    });
    section.classList.toggle('hidden',validImages.length===0);
  }catch(error){
    section.classList.add('hidden');
    console.error('Gallery preview load failed:',error);
  }
}
async function loadSlots(){const date=el('date').value,service=el('service').value;if(!date||!service)return;const data=await api(`/appointments/available/${date}?service=${encodeURIComponent(service)}`);el('time').innerHTML='<option value="">اختر ساعة</option>'+data.availableSlots.map(t=>`<option>${t}</option>`).join('');el('time').disabled=!data.availableSlots.length}
async function book(){try{await api('/appointments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service:el('service').value,date:el('date').value,time:el('time').value,notes:el('bookingNotes').value.trim()})});message('bookingMessage','تم إرسال الطلب إلى صاحب المحل','success');el('bookingNotes').value='';await loadAppointments()}catch(error){message('bookingMessage',error.message,'error')}}
async function loadAppointments(){
  const data=await api('/appointments');
  customerAppointments=data.data;
  const now=Date.now(),archiveAfter=60*60*1000,visible=[],archived=[];
  data.data.forEach(a=>(new Date(a.date).getTime()+archiveAfter<=now?archived:visible).push(a));
  archived.sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()||String(b.time||'').localeCompare(String(a.time||'')));
  const dateLabel=a=>new Date(a.date).toLocaleDateString('ar',{timeZone:'Asia/Jerusalem'});
  const compactAppointment=a=>`<article class="appointment customer-appointment-compact ${a.status}"><time datetime="${escapeHtml(a.date)}">${dateLabel(a)} · ${escapeHtml(a.time)}</time></article>`;
  const fullAppointment=a=>{const pending=a.changeRequest?.status==='pending',canRequest=!['cancelled','completed','no-show'].includes(a.status);return`<article class="appointment ${a.status}"><strong>${escapeHtml(a.service)}</strong><p>${dateLabel(a)} الساعة ${escapeHtml(a.time)}</p><p>الحالة: ${statusLabel(a.status)}</p>${a.notes?`<p>${escapeHtml(a.notes)}</p>`:''}${pending?`<div class="customer-change-request pending"><strong>طلب التعديل قيد المراجعة</strong><p>${escapeHtml(a.changeRequest.requestedService)} · ${escapeHtml(a.changeRequest.requestedDate)} · ${escapeHtml(a.changeRequest.requestedTime)}</p>${a.changeRequest.text?`<p>${escapeHtml(a.changeRequest.text)}</p>`:''}</div>`:''}${canRequest&&!pending?`<button class="secondary change-request-toggle" type="button" onclick="toggleChangeRequest('${a._id}')">طلب تعديل الموعد</button><div id="change-request-${a._id}" class="change-request-form hidden"></div>`:''}</article>`};
  const appointmentList=el('appointments');
  const activeMarkup=visible.map(a=>new Date(a.date).getTime()>now?fullAppointment(a):compactAppointment(a)).join('');
  const historyMarkup=archived.length?`<details class="customer-appointment-history"><summary>المواعيد السابقة (${archived.length})</summary><div class="customer-appointment-history-list">${archived.map(compactAppointment).join('')}</div></details>`:'';
  appointmentList.innerHTML=activeMarkup+historyMarkup||(data.data.length?'<p class="muted">لا توجد مواعيد قريبة</p>':'<p class="muted">لا توجد مواعيد بعد</p>');
  if(appointmentArchiveTimer)clearTimeout(appointmentArchiveTimer);
  const nextArchiveAt=data.data.reduce((next,a)=>{const t=new Date(a.date).getTime()+archiveAfter;return Number.isFinite(t)&&t>now?Math.min(next,t):next},Infinity);
  if(Number.isFinite(nextArchiveAt))appointmentArchiveTimer=setTimeout(()=>{appointmentArchiveTimer=null;loadAppointments().catch(error=>console.error('Appointment history refresh failed:',error))},Math.min(nextArchiveAt-now+250,2147483647));
}
function prepareChangeRequestForm(id){const form=el('change-request-'+id),a=customerAppointments.find(item=>item._id===id);if(!form||!a||form.dataset.ready)return;const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem'}).format(new Date(a.date)),options=customerServices.map(s=>`<option value="${escapeHtml(s.name)}" ${s.name===a.service?'selected':''}>${escapeHtml(s.name)} — ${s.duration} دقيقة</option>`).join('');form.innerHTML=`<label>الخدمة المطلوبة<select id="change-request-service-${id}">${options}</select></label><div class="grid-two customer-booking-date-time"><label>التاريخ المطلوب<input id="change-request-date-${id}" type="date" value="${date}"></label><label>الساعة المطلوبة<input id="change-request-time-${id}" type="time" step="300" value="${escapeHtml(a.time)}"></label></div><label>ملاحظة اختيارية<textarea id="change-request-text-${id}" maxlength="500" rows="3" placeholder="اكتب أي تفاصيل إضافية"></textarea></label><button type="button" onclick="sendChangeRequest('${id}')">إرسال الطلب</button><p id="change-request-message-${id}" class="message"></p>`;form.dataset.ready='1'}
function toggleChangeRequest(id){prepareChangeRequestForm(id);el('change-request-'+id).classList.toggle('hidden')}
async function sendChangeRequest(id){const text=el('change-request-text-'+id).value.trim(),service=el('change-request-service-'+id).value,date=el('change-request-date-'+id).value,time=el('change-request-time-'+id).value;try{await api(`/appointments/${id}/change-request`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,service,date,time})});message('change-request-message-'+id,'تم إرسال طلب التعديل إلى صاحب المحل','success');await loadAppointments()}catch(error){message('change-request-message-'+id,error.message,'error')}}
function statusLabel(s){return({pending:'بانتظار الموافقة',confirmed:'مؤكد',cancelled:'ملغي',completed:'مكتمل','no-show':'لم يحضر'})[s]||s}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function urlBase64ToUint8Array(value){const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
async function enablePush(){try{if(!window.isSecureContext)throw new Error('تتطلب الإشعارات اتصال HTTPS آمناً');if(!window.FadilaPwa?.isStandalone())throw new Error('يجب فتح Fadila من الأيقونة على الشاشة الرئيسية');if(!('serviceWorker'in navigator)||!('Notification'in window)||!('PushManager'in window))throw new Error('إصدار الجهاز أو المتصفح لا يدعم الإشعارات');const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('يرجى السماح بالإشعارات من إعدادات الجهاز');const registration=await navigator.serviceWorker.ready;const {publicKey}=await api('/push/public-key');if(!publicKey)throw new Error('لم يتم إعداد مفاتيح الإشعارات على الخادم بعد');let subscription=await registration.pushManager.getSubscription();subscription=subscription||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(publicKey)});await api('/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription})});updateNotificationState();}catch(error){console.error('Push setup failed:',error);el('notificationState').textContent=error.message||'تعذر تفعيل الإشعارات على هذا الجهاز'}}
function updateNotificationState(){const enabled='Notification'in window&&Notification.permission==='granted';el('notificationCard').classList.toggle('hidden',enabled);if(enabled){el('notificationState').textContent='✅ الإشعارات مفعّلة على هذا الجهاز';el('enableNotifications').classList.add('hidden')}else{el('enableNotifications').classList.remove('hidden')}}
function setFeedbackRating(rating){
  selectedFeedbackRating=Number(rating);
  el('feedbackRating').querySelectorAll('.feedback-star').forEach(button=>{
    const value=Number(button.dataset.rating),selected=value<=selectedFeedbackRating;
    button.setAttribute('aria-checked',String(value===selectedFeedbackRating));
    button.classList.toggle('is-selected',selected);
  });
}
function renderFeedback(data){
  customerFeedback=Array.isArray(data.data)?data.data:[];
  customerFeedbackLoaded=true;
  const average=Number(data.averageRating)||0,count=Number(data.ratingCount)||0;
  el('feedbackAverageValue').textContent=count?average.toFixed(1):'—';
  const filled=count?Math.max(1,Math.min(5,Math.round(average))):0;
  el('feedbackAverageStars').textContent='★'.repeat(filled)+'☆'.repeat(5-filled);
  el('feedbackCount').textContent=`${count} تقييم`;
  el('feedbackList').innerHTML=data.data.length?data.data.map(item=>`<article class="feedback-item"><div class="feedback-item-heading"><strong>${escapeHtml(item.displayName)}</strong><span class="feedback-item-stars" aria-label="${item.rating} من 5">${'★'.repeat(item.rating)}${'☆'.repeat(5-item.rating)}</span></div><time>${new Date(item.createdAt).toLocaleDateString('ar',{timeZone:'Asia/Jerusalem'})}</time><p>${escapeHtml(item.text)}</p></article>`).join(''):'<p class="muted feedback-empty">كن أول من يشارك رأيه.</p>';
}
function maybeShowFeedbackPrompt(){
  const prompt=el('feedbackPrompt');
  if(!prompt||!currentUser?.id||!customerFeedbackLoaded)return;
  const customerId=String(currentUser.id);
  const hasFeedback=customerFeedback.some(item=>String(item.user?._id||item.user?.id||item.user)===customerId);
  if(hasFeedback){prompt.classList.add('hidden');document.body.classList.remove('feedback-prompt-open');return}
  const hasCompletedVisit=customerAppointments.some(appointment=>appointment.status==='completed');
  let dismissed=false;
  try{dismissed=sessionStorage.getItem('feedbackPromptDismissed:'+customerId)==='1'}catch(error){console.warn('Feedback prompt state unavailable:',error)}
  if(!hasCompletedVisit||dismissed)return;
  prompt.classList.remove('hidden');
  document.body.classList.add('feedback-prompt-open');
  el('feedbackPromptNow')?.focus({preventScroll:true});
}
function dismissFeedbackPrompt(){
  el('feedbackPrompt')?.classList.add('hidden');
  document.body.classList.remove('feedback-prompt-open');
  if(currentUser?.id){try{sessionStorage.setItem('feedbackPromptDismissed:'+String(currentUser.id),'1')}catch(error){console.warn('Feedback prompt state unavailable:',error)}}
}
function openFeedbackFromPrompt(){
  dismissFeedbackPrompt();
  document.querySelector('.customer-feedback-card')?.scrollIntoView({block:'center'});
  el('feedbackRating')?.querySelector('.feedback-star')?.focus({preventScroll:true});
}

async function loadFeedback(){
  try{const data=await api('/feedback');renderFeedback(data)}
  catch(error){console.error('Feedback load failed:',error);if(el('feedbackMessage'))message('feedbackMessage','تعذر تحميل التقييمات حالياً','error')}
}
async function submitFeedback(){
  const displayName=el('feedbackName').value.trim(),text=el('feedbackText').value.trim(),button=el('feedbackSubmit');
  if(displayName.length<2)return message('feedbackMessage','يرجى كتابة الاسم الذي سيظهر','error');
  if(!text)return message('feedbackMessage','يرجى كتابة رأيك','error');
  button.disabled=true;
  try{
    await api('/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName,text,rating:selectedFeedbackRating})});
    el('feedbackText').value='';
    setFeedbackRating(5);
    message('feedbackMessage','تم نشر تقييمك مباشرة للجميع','success');
    await loadFeedback();
  }catch(error){message('feedbackMessage',error.message,'error')}
  finally{button.disabled=false}
}

function updateCustomerMessageSelection(){
 const selectAll=el('selectAllCustomerMessages'),bulk=el('messageBulkBar');
 if(!selectAll||!bulk)return;
 const selectedCount=customerMessages.reduce((count,item)=>count+(selectedCustomerMessageIds.has(String(item._id))?1:0),0);
 selectAll.checked=customerMessages.length>0&&selectedCount===customerMessages.length;
 selectAll.indeterminate=selectedCount>0&&selectedCount<customerMessages.length;
 el('selectedCustomerMessagesCount').textContent=`${selectedCount} محددة`;
 el('deleteSelectedCustomerMessages').disabled=selectedCount===0;
 bulk.classList.toggle('hidden',customerMessages.length===0);
}
function renderCustomerMessages(){
 const list=el('messagesList');
 list.innerHTML=customerMessages.length?customerMessages.map(item=>{
  const id=escapeHtml(item._id),isRead=Boolean(item.readAt),selected=selectedCustomerMessageIds.has(String(item._id));
  return `<article class="message-item customer-message-item ${isRead?'':'unread'}">
    <div class="customer-message-top"><label class="customer-message-select"><input type="checkbox" data-message-select value="${id}" ${selected?'checked':''} aria-label="اختيار الرسالة: ${escapeHtml(item.title)}"></label><span class="customer-message-status ${isRead?'is-read':'is-unread'}">${isRead?'مقروءة':'غير مقروءة'}</span></div>
    <div class="customer-message-heading"><h3>${escapeHtml(item.title)}</h3><time>${new Date(item.createdAt).toLocaleString('ar',{timeZone:'Asia/Jerusalem'})}</time></div>
    <p>${escapeHtml(item.body)}</p>
    <div class="customer-message-actions">
      <button type="button" class="secondary compact" data-message-action="${isRead?'unread':'read'}" data-message-id="${id}">${isRead?'تحديد كغير مقروءة':'تأكيد القراءة'}</button>
      <button type="button" class="danger compact" data-message-action="delete" data-message-id="${id}">حذف</button>
    </div>
  </article>`
 }).join(''):'<p class="muted empty-messages">لا توجد رسائل بعد</p>';
 updateCustomerMessageSelection();
}
async function loadMessages(){
 try{
  const data=await api('/messages');
  customerMessages=Array.isArray(data.data)?data.data:[];
  const available=new Set(customerMessages.map(item=>String(item._id)));
  selectedCustomerMessageIds.forEach(id=>{if(!available.has(id))selectedCustomerMessageIds.delete(id)});
  const unreadCount=Number(data.unreadCount)||0;
  el('messagesBadge').textContent=unreadCount>99?'99+':String(unreadCount);
  el('messagesBadge').classList.toggle('hidden',!unreadCount);
  el('messagesBadge').setAttribute('aria-label',`${unreadCount} رسائل غير مقروءة`);
  el('messagesUnreadCount').textContent=`${unreadCount} غير مقروءة`;
  el('messagesUnreadCount').classList.toggle('hidden',!unreadCount);
  renderCustomerMessages();
 }catch(error){console.error('Messages load failed:',error)}
}
async function setCustomerMessageReadState(id,read){
 try{await api(`/messages/${encodeURIComponent(id)}/read`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({read})});await loadMessages()}
 catch(error){alert(error.message)}
}
async function deleteCustomerMessage(id){
 if(!confirm('هل تريد حذف هذه الرسالة؟'))return;
 try{await api(`/messages/${encodeURIComponent(id)}`,{method:'DELETE'});selectedCustomerMessageIds.delete(String(id));await loadMessages()}
 catch(error){alert(error.message)}
}
async function deleteSelectedCustomerMessages(){
 const ids=customerMessages.map(item=>String(item._id)).filter(id=>selectedCustomerMessageIds.has(id));
 if(!ids.length||!confirm(`هل تريد حذف ${ids.length} رسالة محددة؟`))return;
 try{await api('/messages',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});selectedCustomerMessageIds.clear();await loadMessages()}
 catch(error){alert(error.message)}
}
function handleCustomerMessageAction(event){
 const button=event.target.closest('[data-message-action]');if(!button)return;
 const id=button.dataset.messageId,action=button.dataset.messageAction;
 if(action==='delete')deleteCustomerMessage(id);else setCustomerMessageReadState(id,action==='read');
}
async function openMessages(){await loadMessages();el('messagesPanel').classList.remove('hidden');document.body.classList.add('messages-open')}
function closeMessages(){el('messagesPanel').classList.add('hidden');document.body.classList.remove('messages-open')}

function openLogoutConfirmation(){
 closeCustomerNavigation();
 el('logoutConfirmDialog').classList.remove('hidden');
 document.body.classList.add('logout-confirm-open');
 el('cancelLogoutButton').focus();
}
function closeLogoutConfirmation(){
 el('logoutConfirmDialog').classList.add('hidden');
 document.body.classList.remove('logout-confirm-open');
 el('customerMenuButton').focus();
}
function closeCustomerNavigation(){el('customerNavDrawer').classList.remove('is-open');el('customerNavDrawer').setAttribute('aria-hidden','true');el('customerNavBackdrop').classList.add('hidden');el('customerMenuButton').setAttribute('aria-expanded','false');document.body.classList.remove('customer-nav-open')}
function openCustomerNavigation(){el('customerNavDrawer').classList.add('is-open');el('customerNavDrawer').setAttribute('aria-hidden','false');el('customerNavBackdrop').classList.remove('hidden');el('customerMenuButton').setAttribute('aria-expanded','true');document.body.classList.add('customer-nav-open')}
function setupCustomerNavigation(){
 el('customerMenuButton').addEventListener('click',()=>{if(el('customerNavDrawer').classList.contains('is-open'))closeCustomerNavigation();else openCustomerNavigation()});
 el('customerNavClose').addEventListener('click',closeCustomerNavigation);
 el('customerNavBackdrop').addEventListener('click',closeCustomerNavigation);
 el('customerNavDrawer').addEventListener('click',event=>{const button=event.target.closest('[data-customer-nav]');if(!button)return;closeCustomerNavigation();if(button.dataset.customerNav==='appointments')el('myAppointments').scrollIntoView({behavior:'smooth',block:'start'})});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeCustomerNavigation();closeLogoutConfirmation()}});
}
document.addEventListener('DOMContentLoaded',async()=>{el('date').min=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jerusalem'});setupCustomerNavigation();el('enterButton').onclick=enterApp;el('loginButton').onclick=login;el('logoutButton').onclick=openLogoutConfirmation;el('cancelLogoutButton').onclick=closeLogoutConfirmation;el('confirmLogoutButton').onclick=logout;el('logoutConfirmDialog').addEventListener('click',event=>{if(event.target===el('logoutConfirmDialog'))closeLogoutConfirmation()});el('messagesButton').onclick=()=>{closeCustomerNavigation();openMessages()};el('customerRefreshButton').onclick=()=>{closeCustomerNavigation();refreshCustomerData()};el('closeMessages').onclick=closeMessages;el('feedbackPromptClose').onclick=dismissFeedbackPrompt;el('feedbackPromptLater').onclick=dismissFeedbackPrompt;el('feedbackPromptNow').onclick=openFeedbackFromPrompt;el('feedbackPrompt').addEventListener('click',event=>{if(event.target===el('feedbackPrompt'))dismissFeedbackPrompt()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el('feedbackPrompt').classList.contains('hidden'))dismissFeedbackPrompt()});el('messagesPanel').addEventListener('click',event=>{if(event.target===el('messagesPanel'))closeMessages()});el('messagesList').addEventListener('click',handleCustomerMessageAction);el('messagesList').addEventListener('change',event=>{const checkbox=event.target.closest('[data-message-select]');if(!checkbox)return;const id=String(checkbox.value);if(checkbox.checked)selectedCustomerMessageIds.add(id);else selectedCustomerMessageIds.delete(id);updateCustomerMessageSelection()});el('selectAllCustomerMessages').addEventListener('change',event=>{selectedCustomerMessageIds.clear();if(event.target.checked)customerMessages.forEach(item=>selectedCustomerMessageIds.add(String(item._id)));renderCustomerMessages()});el('deleteSelectedCustomerMessages').onclick=deleteSelectedCustomerMessages;navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='fadila-message'&&currentUser){loadMessages();loadFeedback()}});el('enableNotifications').onclick=enablePush;el('bookingToggle').onclick=()=>setBookingFormOpen(el('bookingToggle').getAttribute('aria-expanded')!=='true');setBookingFormOpen(false);el('service').onchange=loadSlots;el('date').onchange=loadSlots;el('bookButton').onclick=book;el('feedbackSubmit').onclick=submitFeedback;el('feedbackRating').addEventListener('click',event=>{const button=event.target.closest('.feedback-star');if(button)setFeedbackRating(button.dataset.rating)});setFeedbackRating(5);if(token()){try{const data=await api('/auth/me');sessionUser=data.user}catch{sessionUser=null}}});
