/* Estadísticas de uso (PostHog): solo se activan con el consentimiento de la persona */
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify alias set_config reset opt_in_capturing opt_out_capturing has_opted_out_capturing get_distinct_id".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
/* Estadísticas de uso: solo se activan si la persona lo acepta */
window.startAnalytics=function(){
  if(window.__phOn||!location.protocol.startsWith('http')||/^(localhost|127\.)/.test(location.hostname))return;
  window.__phOn=true;
  posthog.init('phc_n9qTbE9fX36WouhPv7kYCv84FMWkc8FqwB7TDT9mzUnM',{api_host:'https://eu.i.posthog.com',person_profiles:'identified_only',autocapture:false,capture_pageview:true,disable_session_recording:true,persistence:'localStorage'});
};
try{if(localStorage.getItem('biblioteca.consent')==='yes')startAnalytics()}catch{}
