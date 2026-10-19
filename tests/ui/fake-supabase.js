(function(){
  const now = Date.now(), iso = (m) => new Date(now - m*60000).toISOString();
  const products = [
    {id:'p1',name:'Izgara Köfte',price:250,cost:90,category:'IZGARA ÜRÜNLERİ',station_id:'s1',available:true},
    {id:'p2',name:'Adana',price:245,cost:90,category:'IZGARA ÜRÜNLERİ',station_id:'s1',available:true},
    {id:'p3',name:'Döner 500 GR',price:1500,cost:600,category:'IZGARA ÜRÜNLERİ',station_id:'s1',available:true},
    {id:'p4',name:'Ayran',price:75,cost:20,category:'İÇECEKLER VE TATLILAR',station_id:'s2',available:true},
    {id:'p5',name:'Türk Kahvesi',price:150,cost:30,category:'İÇECEKLER VE TATLILAR',station_id:'s2',available:true},
    {id:'p6',name:'Köşkeroğlu baklava fıstıklı',price:2245,cost:900,category:'İÇECEKLER VE TATLILAR',station_id:'s2',available:true}];
  const tables = Array.from({length:12},(_,i)=>({id:'t'+i,name:'Masa'+(i+1)}));
  const cfg = {stations:[{id:'s1',name:'Fırın',icon:'🍳',color:'#f97316'},{id:'s2',name:'Çayhane',icon:'🍵',color:'#3b82f6'}],
    menus:[{id:'m1',name:'IZGARA ÜRÜNLERİ',station_id:'s1'},{id:'m2',name:'İÇECEKLER VE TATLILAR',station_id:'s2'}],
    products, ingredients:[{id:'i1',name:'Döner Eti',unit:'kg',stock:3,waste_pct:0,min_stock:10},{id:'i2',name:'Ayran',unit:'adet',stock:0,waste_pct:0,min_stock:24},{id:'i3',name:'Lavaş',unit:'adet',stock:200,waste_pct:0,min_stock:50}], zones:[{id:'z1',name:'Salon',tables}], tables,
    order_flags:[{label:'Personel'},{label:'Talebe'}], features:['push_notifications','reservations','crm','reports','printing','messages','radio','purchasing','sms'], loyalty:{enabled:true,spend_per_point:10,point_value:1}, ticket_design:{}, tags:['Personel','Talebe'], roles:[], users:[{id:'u1',username:'Ali Kurye',is_active:true},{id:'u2',username:'Veli',is_active:true}]};
  const liveOrders = [
    {order_id:'o1',table_id:'t1',kind:'dine_in',created_at:iso(25),daily_number:8,tags:[],created_by_name:'MEHMET ALİ KOCAOĞLU',
     items:[{id:'i1',product_id:'p1',name:'Izgara Köfte',price:250,qty:2,status:'ready',added_at:iso(25),ready_at:iso(10),added_by_name:'MEHMET ALİ KOCAOĞLU',station_id:'s1'},
            {id:'i2',product_id:'p4',name:'Ayran',price:75,qty:2,status:'pending',added_at:iso(25),added_by_name:'MEHMET ALİ KOCAOĞLU',station_id:'s2'}]},
    {order_id:'o2',table_id:null,kind:'takeaway',takeaway_type:'pickup',pickup_at:new Date(now+12*60000).toISOString(),customer_name:'Hakan Nişancı',customer_phone:'5551112233',created_at:iso(5),daily_number:9,tags:[],
     items:[{id:'i3',product_id:'p2',name:'Adana',price:245,qty:1,status:'pending',added_at:iso(5),station_id:'s1'}]},
    {order_id:'o3',table_id:null,kind:'takeaway',takeaway_type:'delivery',customer_name:'Elif Su',customer_phone:'5553334455',delivery_address:'Atatürk Cad. 12/4',created_at:iso(20),daily_number:10,tags:[],items:[{id:'i4',product_id:'p2',name:'Adana',price:245,qty:2,status:'ready',added_at:iso(20),station_id:'s1'}]},
    {order_id:'o4',table_id:null,kind:'takeaway',takeaway_type:'delivery',customer_name:'Murat T.',customer_phone:'5554445566',delivery_address:'Cumhuriyet Mah.',created_at:iso(30),daily_number:11,tags:[],courier_user_id:'u1',courier_name:'Ali Kurye',dispatched_at:iso(8),items:[{id:'i5',product_id:'p2',name:'Adana',price:245,qty:1,status:'ready',added_at:iso(30),station_id:'s1'}]},
    {order_id:'o5',table_id:null,kind:'takeaway',takeaway_type:'delivery',customer_name:'Seda K.',created_at:iso(45),daily_number:12,tags:[],dispatched_at:iso(30),delivered_at:iso(5),items:[{id:'i6',product_id:'p2',name:'Adana',price:245,qty:1,status:'ready',added_at:iso(45),station_id:'s1'}]}];
  const MOCK = {
    get_restaurant_config: cfg, list_suppliers: [{id:'s1',name:'Toros Et',phone:'5551112233'}], list_gift_cards: [], get_payroll: [{id:'u1',username:'Ali Kurye',is_active:true,hourly_wage:120,commission_pct:2,hours:42.5,shifts:6,sales:28450,checks:96,tips:640},{id:'u2',username:'Ayşe Garson',is_active:true,hourly_wage:null,commission_pct:null,hours:31.25,shifts:4,sales:15200,checks:51,tips:0}], set_staff_pay: null, list_reviews: {stats:{n:14,avg:4.36,dist:[1,0,2,3,8],sent:31},rows:[{id:'r1',rating:2,comment:'Yemek soğuk geldi, garson ilgisizdi.',rated_at:new Date().toISOString(),table_name:'Masa 4',seen:false,customer_name:'Ali Veli',customer_phone:'5551112233',staff:'Mehmet'},{id:'r2',rating:5,comment:'Harika döner, çok hızlı servis!',rated_at:new Date().toISOString(),table_name:'Bahçe 2',seen:true,staff:'Ayşe'}]}, mark_reviews_seen: null, create_review_link: {token:'11111111-2222-3333-4444-555555555555',sms_sent:false}, list_promotions: [{id:'p1',name:'Hoş geldin',kind:'coupon',code:'HOSGELDIN10',disc_type:'percent',disc_value:10,min_total:200,used_count:3,max_uses:50,active:true,valid_now:true,total_discount:180,days:null},{id:'p2',name:'Happy Hour',kind:'auto',code:null,disc_type:'percent',disc_value:20,min_total:0,used_count:12,active:true,valid_now:false,days:[1,2,3,4,5],hour_from:'15:00:00',hour_to:'18:00:00',total_discount:640}], list_active_promotions: [{id:'p2',name:'Happy Hour',disc_type:'percent',disc_value:20,min_total:0}], get_analytics_bundle: {days:1,kpi:{revenue:8450,checks:42,discount:300,tips:120,cost:2900,cash:3200,card:4900,gift:200,points:150,comp:90,comp_n:1,birthday:0,avg_min:48},prev:{},cancel:{cur:{n:1,amount:60},orders:0},waste:45,daily:[],month:[],heat:[],staff:[]}, list_cash_counts: [{id:'c1',business_date:'2026-10-19',expected:3200,counted:3150,diff:-50,note:'açılış dahil',created_at:new Date().toISOString(),username:'test'}], get_live_orders: liveOrders, get_nav_badges: {kitchen:2,_items:{}},
    list_waitlist: [{id:'w1',customer_name:'Ahmet Bey',phone:'5550000000',party_size:4,joined_at:iso(12),quoted_wait_minutes:20}],
    get_waitlist_estimate: {next:15,avg_stay:50,free_tables:0,per_position:[8,15]},
    list_reservations: [{id:'r1',customer_name:'Ayşe Hanım',phone:'5551234567',party_size:3,reservation_time:new Date(now+3600e3).toISOString(),status:'confirmed'}],
    get_order_quickpicks: {top:['p1','p3','p5'],notes:[]},
    get_channel_speed_report: {channels:[{ch:'table',n:115,rev:717359,avg:6237},{ch:'pickup',n:21,rev:61513,avg:2929}],hours:[{h:12,ch:'table',rev:20000},{h:13,ch:'pickup',rev:5000}],stations:[{station:'Fırın',icon:'🍳',n:157,avg:16.4,p90:39.8,late:54}],slow:[{name:'Izgara Köfte',n:21,avg:20.1}],kitchen:{n:367,avg:16.9,late:125},calls:[{kind:'order',n:5,avg:1.4}],pickup:{n:1,on_time:1}},
    list_customers: [{id:'c1',name:'Ahmet Kaya',phone:'5551112233',points_balance:40,lifetime_points:620},{id:'c2',name:'Zeynep Ak',phone:'5552223344',points_balance:210,lifetime_points:230},{id:'c3',name:'Can Öz',phone:null,points_balance:0,lifetime_points:0}], search_customers_quick: [], list_my_notifications: [], list_open_accounts: [],
  };
  window.__MOCK = MOCK;
  const q = () => { const p = Promise.resolve({data:[],error:null}); const o = new Proxy(function(){}, {get:(t,k)=> k==='then' ? p.then.bind(p) : (()=>o), apply:()=>o}); return o; };
  window.supabase = { createClient(){ return {
    rpc: async (n) => ({ data: n in MOCK ? JSON.parse(JSON.stringify(MOCK[n])) : null, error: null }),
    from: () => q(), channel: () => ({ on(){return this;}, subscribe(){return this;}, send(){}, track(){}, presenceState(){return {};} }),
    removeChannel(){}, storage: { from: () => q() }, auth: { getSession: async()=>({data:{}}) , onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; } } }; } };
})();
