 <script>
    /* ---------------- Configuration ---------------- */
    const DATA_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTp1LlW5tsWIyE7E5BGFiKHS2qBjzh8wGaZdR3EsQSzXVyxgq1hrh4y54KpkVHiL-4Moux0CA43c4nb/pub?gid=0&single=true&output=csv";
    const IMAGE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTp1LlW5tsWIyE7E5BGFiKHS2qBjzh8wGaZdR3EsQSzXVyxgq1hrh4y54KpkVHiL-4Moux0CA43c4nb/pub?gid=676833393&single=true&output=csv";
    const CATEGORY_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTp1LlW5tsWIyE7E5BGFiKHS2qBjzh8wGaZdR3EsQSzXVyxgq1hrh4y54KpkVHiL-4Moux0CA43c4nb/pub?gid=2136776722&single=true&output=csv";

    // OPTIONAL: If you deploy a Google Apps Script Web App to accept POSTs to save enquiries,
    // put its URL here. If left blank, the script will still send WhatsApp messages but won't auto-save.
    const SHEET_WEBHOOK = ""; // e.g. https://script.google.com/macros/s/XXX/exec

    const WHATSAPP_NUMBER = "917986297302"; // without +

    /* ---------------- Data stores ---------------- */
    let allData = [];
    let imageMap = {};
    let categoryImageMap = {};
    let currentCategory = null;
    let currentItemCode = null;
    let currentSearchResults = null;

    /* ---------------- Load CSVs ---------------- */
    Promise.all([
      fetch(DATA_URL).then(r=>r.text()),
      fetch(IMAGE_URL).then(r=>r.text()),
      fetch(CATEGORY_URL).then(r=>r.text())
    ]).then(([dataText,imageText,categoryText])=>{
      allData = Papa.parse(dataText,{header:true}).data.filter(r=>r["Item Code"] && r["Category"]);
      allData.forEach(r=>{ if(r["Category"]) r["Category"] = r["Category"].trim(); });
      Papa.parse(imageText,{header:true}).data.forEach(r=>{ if(r["Item Code"] && r["Image URL"]) imageMap[r["Item Code"].trim()] = r["Image URL"]; });
      Papa.parse(categoryText,{header:true}).data.forEach(r=>{ if(r["Category"] && r["Image URL"]) categoryImageMap[r["Category"].trim()] = r["Image URL"]; });
      renderCategories();
    }).catch(e=>{ document.getElementById('catalogue').innerHTML = '<p>❌ Failed to load data.</p>'; console.error(e);});

    /* ---------------- Navigation ---------------- */
    function showSection(id){
      document.querySelectorAll('main > section').forEach(s=>s.style.display='none');
      document.getElementById(id).style.display = 'block';
      if(id==='products') renderCategories();
      if(id==='cart') renderCart();
    }

    /* ---------------- Breadcrumb ---------------- */
    function renderBreadcrumb(level){
      const breadcrumb = document.getElementById('breadcrumb');
      let html = '';
      if(level==='category') html = `<button class="back-btn" onclick="renderCategories()">⬅ Back to Categories</button>`;
      else if(level==='item') html = `<button class="back-btn" onclick="renderItems('${currentCategory.replace(/'/g,"\\'")}')">⬅ Back to ${currentCategory}</button>`;
      else if(level==='search') html = `<button class="back-btn" onclick="clearSearch()">⬅ Back to Home</button>`;
      breadcrumb.innerHTML = html;
    }

    /* ---------------- Categories ---------------- */
    function renderCategories(){
      currentCategory = null; currentItemCode = null; currentSearchResults = null; renderBreadcrumb('');
      const container = document.getElementById('catalogue');
      container.innerHTML = `<h2>Product Categories</h2><div class="grid"></div>`;
      const grid = container.querySelector('.grid');
      const categories = [...new Set(allData.map(i=>i['Category']))].filter(Boolean).sort();
      categories.forEach(cat=>{
        const div = document.createElement('div'); div.className='card category-card';
        const catImg = categoryImageMap[cat] || 'https://via.placeholder.com/300x180?text='+encodeURIComponent(cat);
        div.innerHTML = `<img src="${catImg}" alt="${cat}" class="card-image"/><div class="card-title">${cat}</div>`;
        div.onclick = ()=> renderItems(cat);
        grid.appendChild(div);
      });
    }

    /* ---------------- Items ---------------- */
    function renderItems(category){
      currentCategory = category; renderBreadcrumb('category');
      const container = document.getElementById('catalogue'); container.innerHTML = `<h2>${category}</h2><div class="grid"></div>`;
      const grid = container.querySelector('.grid');
      const items = [...new Set(allData.filter(r=>r['Category']===category).map(r=>r['Item Code']))];
      items.forEach(code=>{
        const div = document.createElement('div'); div.className='card';
        const img = imageMap[code] || 'https://via.placeholder.com/150?text='+encodeURIComponent(code);
        const item = allData.find(r=>r['Item Code']===code) || {};
        const itemName = item['Item Name'] || '';
        div.innerHTML = `<img src="${img}" alt="${code}" class="card-image"/><div class="card-title">${itemName}</div><div class="card-code">Code: ${code}</div>`;
        div.onclick = ()=> renderItemDetail(code);
        grid.appendChild(div);
      });
    }

    /* ---------------- Item Detail with Add to Cart ---------------- */
    function renderItemDetail(itemCode){
      currentItemCode = itemCode; renderBreadcrumb('item');
      const entries = allData.filter(r=>r['Item Code']===itemCode && (!currentCategory || r['Category']===currentCategory));
      if(entries.length===0){ document.getElementById('catalogue').innerHTML='<p>No item found.</p>'; return; }
      const first = entries[0];
      const img = imageMap[itemCode] || 'https://via.placeholder.com/320x240?text='+encodeURIComponent(itemCode);
      const container = document.getElementById('catalogue');
      container.innerHTML = `
        <h2>${first['Item Name'] || ''}</h2>
        <p class="meta"><strong>Item Code:</strong> ${first['Item Code'] || ''} | <strong>HSN Code:</strong> ${first['HSN Code'] || ''}</p>
        <img src="${img}" alt="${itemCode}" class="detail-image"/>
        <p class="specs"><em>${first['Specs'] || ''}</em></p>
        <table>
          <tr><th>Variant Code</th><th>Description</th><th>Price/Unit</th><th>Unit</th><th>MOQ</th><th>Actions</th></tr>
          ${entries.reduce((unique,entry)=>{ if(!unique.some(e=>e['Variant Code']===entry['Variant Code'])) unique.push(entry); return unique; },[]).map(entry=>{
            const price = entry['Price/Unit']||'';
            return `
              <tr>
                <td>${entry['Variant Code']||''}</td>
                <td>${entry['Description']||''}</td>
                <td>${price}</td>
                <td>${entry['Unit']||''}</td>
                <td>${entry['MOQ']||''}</td>
                <td><button onclick="addToCartPrompt('${encodeURIComponent(itemCode)}','${encodeURIComponent(entry['Variant Code']||'')}', '${encodeURIComponent(entry['Description']||'')}', '${encodeURIComponent(price)}')">Add to Cart</button>
                    <a class='wa-link' target='_blank' href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi, I\'m interested in this tool:\nItem: '+(first['Item Name']||'')+'\nVariant Code: '+(entry['Variant Code']||'')+'\nDescription: '+(entry['Description']||'')+'\nPrice: '+price)}"><i class='fab fa-whatsapp'></i> Chat</a>
                </td>
              </tr>
            `;
          }).join('')}
        </table>
      `;
    }

    function addToCartPrompt(itemCodeEnc, variantEnc, descEnc, priceEnc){
      const itemCode = decodeURIComponent(itemCodeEnc);
      const variantCode = decodeURIComponent(variantEnc);
      const description = decodeURIComponent(descEnc);
      const price = decodeURIComponent(priceEnc);
      let qty = prompt('Enter required quantity for Variant '+variantCode+':','1');
      if(qty===null) return; qty = qty.trim(); if(qty===''||isNaN(qty)||Number(qty)<=0){ alert('Please enter a valid quantity'); return; }
      addToCart({ itemCode, variantCode, description, price, qty: Number(qty) });
    }

    /* ---------------- Cart Management ---------------- */
    function getCart(){ try{ return JSON.parse(localStorage.getItem('sni_cart')||'[]'); }catch(e){ return []; } }
    function saveCart(cart){ localStorage.setItem('sni_cart', JSON.stringify(cart)); updateCartCount(); }
    function addToCart(item){
      const cart = getCart();
      // find if same variant exists
      const existing = cart.find(c=>c.variantCode===item.variantCode);
      if(existing){ existing.qty = existing.qty + item.qty; }
      else{
        // try to enrich with itemName and image
        const first = allData.find(r=>r['Item Code']===item.itemCode) || {};
        const img = imageMap[item.itemCode] || '';
        cart.push({ itemCode: item.itemCode, itemName: first['Item Name']||'', variantCode: item.variantCode, description: item.description, price: item.price, unit: first['Unit']||'', qty: item.qty, img });
      }
      saveCart(cart);
      alert('Added to cart');
    }

    function renderCart(){
      const container = document.getElementById('cart-contents');
      const cart = getCart(); updateCartCount();
      if(cart.length===0){ container.innerHTML = '<p>Your cart is empty.</p>'; return; }
      let html = `<table class="cart-table"><tr><th>Image</th><th>Item Name</th><th>Variant Code</th><th>Description</th><th>Price/Unit</th><th>Qty</th></tr>`;
      cart.forEach((c,idx)=>{
        const img = c.img || 'https://via.placeholder.com/80?text='+encodeURIComponent(c.itemCode);
        html += `<tr>
          <td><img src="${img}" style="max-width:80px;border-radius:6px"/></td>
          <td>${c.itemName||c.itemCode}</td>
          <td>${c.variantCode}</td>
          <td>${c.description||''}</td>
          <td>${c.price||''}</td>
          <td><input type="number" min="1" value="${c.qty}" onchange="updateQty(${idx},this.value)" style="width:80px"/></td>
        </tr>`;
      });
      html += `</table>`;
      container.innerHTML = html;
    }

    function updateQty(index,val){ const cart = getCart(); val = Number(val); if(isNaN(val)||val<=0) return; cart[index].qty = val; saveCart(cart); renderCart(); }
    function clearCart(){ if(!confirm('Clear cart?')) return; localStorage.removeItem('sni_cart'); renderCart(); updateCartCount(); }
    function updateCartCount(){ const n = getCart().reduce((s,i)=>s+i.qty,0); document.getElementById('cart-count').innerText = n; }

    /* ---------------- PDF Export ---------------- */
    async function downloadCartPDF(){ const cart = getCart(); if(cart.length===0){ alert('Cart empty'); return; }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF(); let y=12;
      doc.setFontSize(14); doc.text('SRI NEELKANTH IMPEX PVT. LTD. - Cart Quote',12,y); y+=8;
      doc.setFontSize(10);
      cart.forEach((c,idx)=>{
        const line = `${idx+1}. ${c.itemName||c.itemCode} | Variant: ${c.variantCode} | Qty: ${c.qty} | Price: ${c.price}`;
        if(y>270){ doc.addPage(); y=12; }
        doc.text(line,12,y); y+=6;
      });
      doc.save('cart-quote.pdf');
    }

    /* ---------------- Cart Enquiry (WhatsApp) ---------------- */
    function openCartEnquiryModal(){ document.getElementById('cart-modal').style.display='flex'; }
    function closeCartModal(){ document.getElementById('cart-modal').style.display='none'; }
    function sendCartEnquiry(){ const name = document.getElementById('cart-cust-name').value.trim(); const mobile = document.getElementById('cart-cust-mobile').value.trim(); const email = document.getElementById('cart-cust-email').value.trim(); const city = document.getElementById('cart-cust-city').value.trim();
      if(!name||!mobile){ alert('Please enter Name and Mobile'); return; }
      const cart = getCart(); if(cart.length===0){ alert('Cart is empty'); return; }
      let msg = `Enquiry from ${name} (City: ${city || 'N/A'})\nMobile: ${mobile}${email?('\nEmail: '+email):''}\n\nItems:`;
      cart.forEach(c=>{ msg += `\n- ${c.itemName||c.itemCode} | Variant: ${c.variantCode} | Qty: ${c.qty} | Price: ${c.price}`; });
      const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
      // Optionally store to sheet
      if(SHEET_WEBHOOK){ try{ fetch(SHEET_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'cart_enquiry',name,city,mobile,email,cart})}); }catch(e){ console.warn('sheet save failed',e); } }
      window.open(wa,'_blank'); closeCartModal(); }

    /* ---------------- Enquiry Form ---------------- */
    function sendEnquiry(){ const name = document.getElementById('enq-name').value.trim(); const email = document.getElementById('enq-email').value.trim(); const mobile = document.getElementById('enq-mobile').value.trim(); const city = document.getElementById('enq-city').value.trim(); const req = document.getElementById('enq-requirements').value.trim();
      if(!name||!mobile||!req){ alert('Please enter Name, Mobile and Requirements'); return; }
      const msg = `Enquiry from ${name} (City: ${city||'N/A'})\nMobile: ${mobile}${email?('\nEmail: '+email):''}\n\nRequirement:\n${req}`;
      // attempt to save
      if(SHEET_WEBHOOK){ try{ fetch(SHEET_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'enquiry',name,email,mobile,city,req})}); }catch(e){ console.warn('sheet save failed',e);} }
      const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
      window.open(wa,'_blank'); alert('Opening WhatsApp to send your enquiry');
    }
    function tryStoreEnquiry(){ if(!SHEET_WEBHOOK){ alert('No SHEET_WEBHOOK configured. To enable, set SHEET_WEBHOOK variable in the script to your Google Apps Script Web App URL.'); return; }
      // attempt to collect and send
      const name = document.getElementById('enq-name').value.trim(); const email = document.getElementById('enq-email').value.trim(); const mobile = document.getElementById('enq-mobile').value.trim(); const city = document.getElementById('enq-city').value.trim(); const req = document.getElementById('enq-requirements').value.trim();
      if(!name||!mobile){ alert('Name and Mobile required to save'); return; }
      fetch(SHEET_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'enquiry',name,email,mobile,city,req})}).then(()=>alert('Saved to sheet (if webhook valid)')).catch(()=>alert('Failed to save to sheet'));
    }

    /* ---------------- Global Search ---------------- */
    function performSearch(){ const query = document.getElementById('searchInput').value.trim().toLowerCase(); if(!query) return; currentSearchResults = allData.filter(r=> (r['Item Code']||'').toLowerCase().includes(query) || (r['Item Name']||'').toLowerCase().includes(query) || (r['Category']||'').toLowerCase().includes(query)); renderBreadcrumb('search'); const container = document.getElementById('catalogue'); container.innerHTML = `<h2>Search Results for "${query}"</h2><div class="grid"></div>`; const grid = container.querySelector('.grid'); const uniqueItems = [...new Set(currentSearchResults.map(r=>r['Item Code']))]; if(uniqueItems.length===0){ grid.innerHTML = '<p>No results found.</p>'; return; } uniqueItems.forEach(code=>{ const div = document.createElement('div'); div.className='card'; const img = imageMap[code] || 'https://via.placeholder.com/150?text='+encodeURIComponent(code); const itemName = allData.find(r=>r['Item Code']===code)?.['Item Name'] || ''; div.innerHTML = `<img src="${img}" alt="${code}" class="card-image"/><div class="card-title">${itemName||code}</div>`; div.onclick = ()=> renderItemDetail(code); grid.appendChild(div); }); }
    function clearSearch(){ document.getElementById('searchInput').value=''; renderCategories(); }

    // initialize cart count
    updateCartCount();
  </script>
