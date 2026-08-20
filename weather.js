/**
 * 广东天气通（佛山顺德 / 汕头 / 东莞）- 纯前端静态版
 * 直接调用 Open-Meteo API（免费，无需API密钥，支持CORS）
 */

// 城市坐标（佛山顺德 / 汕头 / 东莞）
const CITIES = {
    shunde:   { name: "佛山顺德", lat: 22.80, lon: 113.10 },
    shantou:  { name: "汕头",     lat: 23.35, lon: 116.68 },
    dongguan: { name: "东莞",     lat: 23.02, lon: 113.75 },
};
let currentCityId = "shunde";
const TZ = "Asia/Shanghai";

function getCity() { return CITIES[currentCityId]; }

// 天气代码映射
const WEATHER_CODES = {
    0: ["晴天", "☀️"], 1: ["大部晴朗", "🌤️"], 2: ["局部多云", "⛅"],
    3: ["多云", "☁️"], 45: ["雾", "🌫️"], 48: ["雾凇", "🌫️"],
    51: ["小毛毛雨", "🌦️"], 53: ["中毛毛雨", "🌦️"], 55: ["大毛毛雨", "🌧️"],
    56: ["冻毛毛雨", "🌧️"], 57: ["冻毛毛雨", "🌧️"],
    61: ["小雨", "🌦️"], 63: ["中雨", "🌧️"], 65: ["大雨", "🌧️"],
    66: ["冻雨", "🌧️"], 67: ["冻雨", "🌧️"],
    71: ["小雪", "🌨️"], 73: ["中雪", "🌨️"], 75: ["大雪", "❄️"], 77: ["雪粒", "❄️"],
    80: ["阵雨", "🌦️"], 81: ["中阵雨", "🌧️"], 82: ["大阵雨", "🌧️"],
    85: ["小阵雪", "🌨️"], 86: ["大阵雪", "❄️"],
    95: ["雷暴", "⛈️"], 96: ["雷暴+冰雹", "⛈️"], 99: ["雷暴+冰雹", "⛈️"],
};

const WIND_DIRS = ["北","北东北","东北","东东北","东","东东南","东南","南东南","南","南西南","西南","西西南","西","西西北","西北","北西北"];

function getWeather(code) { return WEATHER_CODES[code] || ["未知", "❓"]; }
function getWindDir(deg) { return deg != null ? WIND_DIRS[Math.round(deg / 22.5) % 16] : "未知"; }
function isRainy(code) { return [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code); }
function getRainIntensity(mm) {
    if (!mm || mm === 0) return "无雨";
    if (mm < 0.5) return "微雨"; if (mm < 2.5) return "小雨";
    if (mm < 10) return "中雨"; if (mm < 50) return "大雨";
    return "暴雨";
}

function formatDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00+08:00");
    const weekdays = ["周日","周一","周二","周三","周四","周五","周六"];
    const today = new Date(); today.setHours(0,0,0,0);
    const y = new Date(today); y.setDate(y.getDate() - 1);
    const t = today.toISOString().split("T")[0];
    const ys = y.toISOString().split("T")[0];
    if (dateStr === t) return "今天";
    if (dateStr === ys) return "昨天";
    return `${d.getMonth()+1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
}

// ============ API 调用 ============

async function fetchForecast() {
    const city = getCity();
    const params = new URLSearchParams({
        latitude: city.lat, longitude: city.lon,
        current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,cloud_cover,uv_index",
        hourly: "temperature_2m,precipitation_probability,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,relative_humidity_2m,apparent_temperature,uv_index",
        daily: "temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,precipitation_hours,weather_code,sunrise,sunset,wind_speed_10m_max,wind_direction_10m_dominant,uv_index_max",
        timezone: TZ, forecast_days: 4
    });
    const resp = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!resp.ok) throw new Error(`预报API错误: ${resp.status}`);
    return resp.json();
}

async function fetchHistorical(dateStr) {
    const city = getCity();
    const params = new URLSearchParams({
        latitude: city.lat, longitude: city.lon,
        start_date: dateStr, end_date: dateStr,
        daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,weather_code,wind_speed_10m_max,wind_direction_10m_dominant",
        timezone: TZ
    });
    const resp = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
    if (!resp.ok) throw new Error(`历史API错误: ${resp.status}`);
    return resp.json();
}

// ============ 数据解析 ============

function parseCurrent(current) {
    if (!current) return null;
    const [desc, icon] = getWeather(current.weather_code);
    return {
        temperature: round(current.temperature_2m),
        feels_like: round(current.apparent_temperature),
        humidity: current.relative_humidity_2m,
        precipitation: round(current.precipitation, 2),
        rain: round(current.rain, 2),
        weather_code: current.weather_code, weather_desc: desc, weather_icon: icon,
        wind_speed: round(current.wind_speed_10m),
        wind_direction: getWindDir(current.wind_direction_10m),
        pressure: round(current.pressure_msl), cloud_cover: current.cloud_cover,
        uv_index: round(current.uv_index),
    };
}

function parseHourly(hourly, targetDate) {
    const items = [];
    for (let i = 0; i < hourly.time.length; i++) {
        if (!hourly.time[i].startsWith(targetDate)) continue;
        const [desc, icon] = getWeather(hourly.weather_code[i]);
        const rain = round(hourly.rain?.[i] ?? 0, 2);
        const precip = round(hourly.precipitation?.[i] ?? 0, 2);
        items.push({
            time: hourly.time[i].split("T")[1],
            temperature: round(hourly.temperature_2m[i]),
            feels_like: round(hourly.apparent_temperature[i]),
            humidity: hourly.relative_humidity_2m[i],
            weather_code: hourly.weather_code[i], weather_desc: desc, weather_icon: icon,
            precipitation: precip, rain: rain,
            precipitation_probability: hourly.precipitation_probability?.[i] ?? 0,
            rain_intensity: getRainIntensity(rain),
            is_rainy: isRainy(hourly.weather_code[i]),
            cloud_cover: hourly.cloud_cover[i],
            wind_speed: round(hourly.wind_speed_10m[i]),
            wind_direction: getWindDir(hourly.wind_direction_10m[i]),
            uv_index: round(hourly.uv_index?.[i] ?? 0),
        });
    }
    return items;
}

function parseDaily(daily, idx) {
    const [desc, icon] = getWeather(daily.weather_code[idx]);
    return {
        date: daily.time[idx],
        temp_max: round(daily.temperature_2m_max[idx]),
        temp_min: round(daily.temperature_2m_min[idx]),
        feels_like_max: round(daily.apparent_temperature_max[idx]),
        feels_like_min: round(daily.apparent_temperature_min[idx]),
        precipitation_sum: round(daily.precipitation_sum[idx], 2),
        precipitation_probability_max: daily.precipitation_probability_max[idx],
        precipitation_hours: daily.precipitation_hours[idx],
        weather_code: daily.weather_code[idx], weather_desc: desc, weather_icon: icon,
        sunrise: daily.sunrise[idx].split("T")[1],
        sunset: daily.sunset[idx].split("T")[1],
        wind_speed_max: round(daily.wind_speed_10m_max[idx]),
        wind_direction: getWindDir(daily.wind_direction_10m_dominant[idx]),
        uv_index_max: round(daily.uv_index_max?.[idx] ?? 0),
    };
}

function round(v, decimals = 1) {
    if (v == null) return 0;
    const f = Math.pow(10, decimals);
    return Math.round(v * f) / f;
}

function generateAdvice(current, hourly, forecast) {
    const adv = [];
    if (current) {
        if ([95,96,99].includes(current.weather_code)) adv.push("⚠️ 当前有雷暴天气，请尽量避免户外活动，注意安全！");
        else if (current.precipitation > 5) adv.push("🌧️ 当前雨势较大，出门请带好雨具，注意出行安全。");
        else if (current.precipitation > 0) adv.push("🌂 当前有降雨，建议携带雨伞。");
        if (current.temperature > 35) adv.push("🔥 当前气温较高，注意防暑降温，多饮水。");
        else if (current.temperature < 10) adv.push("🥶 当前气温较低，注意添衣保暖。");
        if (current.uv_index > 7) adv.push("☀️ 紫外线指数较高，外出请注意防晒。");
    }
    const rainHours = hourly.filter(h => h.is_rainy);
    if (rainHours.length > 0) {
        const times = rainHours.slice(0, 5).map(h => h.time.slice(0, 5)).join(", ");
        adv.push(`⏰ 今日降雨时段预测：${times}${rainHours.length > 5 ? ` 等${rainHours.length}个时段` : ""}，请合理安排出行。`);
    } else {
        adv.push("✅ 今日预计无降雨，适合户外活动。");
    }
    for (const d of forecast) {
        if (d.precipitation_sum > 10) adv.push(`📅 ${d.date}预计有较大降雨（${d.precipitation_sum}mm），请注意防范。`);
        else if (d.precipitation_sum > 0) adv.push(`📅 ${d.date}可能有降雨，建议届时关注天气变化。`);
    }
    return adv;
}

// ============ 渲染 ============

function renderCurrent(data) {
    const c = data.current;
    if (!c) return;
    document.getElementById("currentTemp").textContent = `${c.temperature}°C`;
    document.getElementById("feelsLike").textContent = `${c.feels_like}°C`;
    document.getElementById("weatherIconBig").textContent = c.weather_icon;
    document.getElementById("weatherDesc").textContent = c.weather_desc;
    document.getElementById("currentDetails").innerHTML = `
        <div class="detail-item"><span class="label">湿度</span><span class="value">${c.humidity}%</span></div>
        <div class="detail-item"><span class="label">降水</span><span class="value">${c.precipitation}mm</span></div>
        <div class="detail-item"><span class="label">风速</span><span class="value">${c.wind_speed}km/h</span></div>
        <div class="detail-item"><span class="label">风向</span><span class="value">${c.wind_direction}</span></div>
        <div class="detail-item"><span class="label">气压</span><span class="value">${c.pressure}hPa</span></div>
        <div class="detail-item"><span class="label">云量</span><span class="value">${c.cloud_cover}%</span></div>
        <div class="detail-item"><span class="label">紫外线</span><span class="value">${c.uv_index}</span></div>
    `;
}

function renderHourly(hourly) {
    const grid = document.getElementById("hourlyGrid");
    const summary = document.getElementById("rainSummary");
    grid.innerHTML = "";
    hourly.forEach(h => {
        const el = document.createElement("div");
        el.className = `hourly-item${h.is_rainy ? " rainy" : ""}${h.precipitation >= 5 ? " heavy" : ""}`;
        el.innerHTML = `
            <span class="hour-time">${h.time.slice(0,5)}</span>
            <span class="hour-icon">${h.weather_icon}</span>
            <span class="hour-temp">${h.temperature}°</span>
            <span class="hour-rain${h.precipitation >= 5 ? " heavy" : ""}">${h.is_rainy ? h.precipitation + "mm" : "--"}</span>
            <span class="hour-prob">${h.precipitation_probability}%</span>
        `;
        grid.appendChild(el);
    });
    const now = new Date();
    const scrollPos = now.getHours() * 98;
    document.querySelector(".hourly-scroll").scrollLeft = Math.max(0, scrollPos - 200);

    const rainH = hourly.filter(h => h.is_rainy);
    const totalPrecip = hourly.reduce((s, h) => s + h.precipitation, 0);
    const maxProb = Math.max(...hourly.map(h => h.precipitation_probability));
    if (rainH.length > 0) {
        summary.innerHTML = `
            <span class="rain-summary-badge">🌧️ 预计 ${rainH.length} 个时段有雨</span>
            <span class="rain-summary-badge">💧 总降水量 ${totalPrecip.toFixed(1)}mm</span>
            <span class="rain-summary-badge">📊 最高降雨概率 ${maxProb}%</span>
        `;
    } else {
        summary.innerHTML = `<span class="rain-summary-badge ok">✅ 今日预计无降雨</span>`;
    }
}

function renderAdvice(advice) {
    const list = document.getElementById("adviceList");
    list.innerHTML = advice.map(a => `<div class="advice-item">${a}</div>`).join("");
}

function renderYesterday(data) {
    const grid = document.getElementById("yesterdayGrid");
    if (!data) {
        grid.innerHTML = '<p style="color: var(--text-light);">暂无昨日数据</p>';
        return;
    }
    grid.innerHTML = `
        <div class="yesterday-item"><div class="yesterday-icon">${data.weather_icon}</div><div class="yesterday-label">天气概况</div><div class="yesterday-value">${data.weather_desc}</div></div>
        <div class="yesterday-item"><div class="yesterday-icon">🌡️</div><div class="yesterday-label">最高/最低温</div><div class="yesterday-value">${data.temp_max}° / ${data.temp_min}°</div></div>
        <div class="yesterday-item"><div class="yesterday-icon">💧</div><div class="yesterday-label">降水量</div><div class="yesterday-value">${data.precipitation_sum}mm</div></div>
        <div class="yesterday-item"><div class="yesterday-icon">⏱️</div><div class="yesterday-label">降雨时长</div><div class="yesterday-value">${data.precipitation_hours}h</div></div>
        <div class="yesterday-item"><div class="yesterday-icon">💨</div><div class="yesterday-label">最大风速</div><div class="yesterday-value">${data.wind_speed_max}km/h</div></div>
        <div class="yesterday-item"><div class="yesterday-icon">🧭</div><div class="yesterday-label">主导风向</div><div class="yesterday-value">${data.wind_direction}</div></div>
    `;
}

function renderForecast(forecast) {
    const grid = document.getElementById("forecastGrid");
    grid.innerHTML = forecast.map(d => `
        <div class="forecast-card">
            <div class="forecast-date">${formatDate(d.date)} (${d.date})</div>
            <div class="forecast-icon">${d.weather_icon}</div>
            <div class="forecast-desc">${d.weather_desc}</div>
            <div class="forecast-temps">
                <span class="forecast-temp-high">${d.temp_max}°</span>
                <span class="forecast-temp-low">${d.temp_min}°</span>
            </div>
            <div class="forecast-details">
                <div class="forecast-detail-item"><span class="detail-label">体感最高</span><span class="detail-value">${d.feels_like_max}°</span></div>
                <div class="forecast-detail-item"><span class="detail-label">体感最低</span><span class="detail-value">${d.feels_like_min}°</span></div>
                <div class="forecast-detail-item"><span class="detail-label">降水量</span><span class="detail-value">${d.precipitation_sum}mm</span></div>
                <div class="forecast-detail-item"><span class="detail-label">降雨概率</span><span class="detail-value">${d.precipitation_probability_max}%</span></div>
                <div class="forecast-detail-item"><span class="detail-label">降雨时长</span><span class="detail-value">${d.precipitation_hours}h</span></div>
                <div class="forecast-detail-item"><span class="detail-label">最大风速</span><span class="detail-value">${d.wind_speed_max}km/h</span></div>
                <div class="forecast-detail-item"><span class="detail-label">风向</span><span class="detail-value">${d.wind_direction}</span></div>
                <div class="forecast-detail-item"><span class="detail-label">日出/日落</span><span class="detail-value">${d.sunrise}/${d.sunset}</span></div>
                <div class="forecast-detail-item"><span class="detail-label">紫外线</span><span class="detail-value">${d.uv_index_max}</span></div>
            </div>
        </div>
    `).join("");
}

// ============ 主流程 ============

async function fetchWeather() {
    const loading = document.getElementById("loading");
    const error = document.getElementById("error");
    const content = document.getElementById("weatherContent");

    loading.classList.remove("hidden");
    error.classList.add("hidden");
    content.classList.add("hidden");

    updateLocationLabels();

    try {
        const now = new Date();
        // 北京时间偏移 +8小时
        const nowBJ = new Date(now.getTime() + 8 * 3600000);
        const todayStr = nowBJ.toISOString().split("T")[0];
        const yesterdayDate = new Date(nowBJ);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

        // 并行请求预报和历史数据
        const [forecast, historical] = await Promise.all([
            fetchForecast(),
            fetchHistorical(yesterdayStr).catch(() => null)
        ]);

        const current = parseCurrent(forecast.current);
        const todayHourly = parseHourly(forecast.hourly, todayStr);
        const forecastDays = [];
        for (let i = 0; i < 3; i++) {
            forecastDays.push(parseDaily(forecast.daily, i));
        }

        let yesterday = null;
        if (historical && historical.daily) {
            const d = historical.daily;
            const [desc, icon] = getWeather(d.weather_code[0]);
            yesterday = {
                date: yesterdayStr,
                temp_max: round(d.temperature_2m_max[0]),
                temp_min: round(d.temperature_2m_min[0]),
                precipitation_sum: round(d.precipitation_sum[0], 2),
                precipitation_hours: d.precipitation_hours[0],
                weather_code: d.weather_code[0], weather_desc: desc, weather_icon: icon,
                wind_speed_max: round(d.wind_speed_10m_max[0]),
                wind_direction: getWindDir(d.wind_direction_10m_dominant[0]),
            };
        }

        const advice = generateAdvice(current, todayHourly, forecastDays);
        const updateTime = nowBJ.toISOString().replace("T", " ").slice(0, 19);

        // 更新UI
        document.getElementById("updateTime").textContent = `🕐 ${updateTime}`;
        document.getElementById("footerUpdateTime").textContent = updateTime;

        renderCurrent({ current });
        renderHourly(todayHourly);
        renderAdvice(advice);
        renderYesterday(yesterday);
        renderForecast(forecastDays);

        loading.classList.add("hidden");
        content.classList.remove("hidden");

    } catch (err) {
        console.error("Weather fetch error:", err);
        loading.classList.add("hidden");
        error.classList.remove("hidden");
        document.getElementById("errorMsg").textContent =
            err.message.includes("fetch") ? "网络连接失败，请检查网络后重试" : err.message;
    }
}

// ============ 城市切换 ============

function updateLocationLabels() {
    const city = getCity();
    document.getElementById("weatherLocation").textContent = `📍 ${city.name}`;
    document.getElementById("footerLocation").textContent =
        `${city.name} · 北纬${city.lat.toFixed(2)}° 东经${city.lon.toFixed(2)}°`;
    document.getElementById("loadingText").textContent = `正在获取${city.name}最新天气数据...`;
}

function initCityTabs() {
    document.querySelectorAll(".city-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const id = tab.dataset.city;
            if (id === currentCityId) return;
            currentCityId = id;
            document.querySelectorAll(".city-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            fetchWeather();
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initCityTabs();
    fetchWeather();
});
setInterval(fetchWeather, 30 * 60 * 1000);