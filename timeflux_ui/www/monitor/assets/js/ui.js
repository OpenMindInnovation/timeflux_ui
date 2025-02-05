var io = new IO();

var charts = {}
var series = {}
var last_millis_per_pixel = 10

var Chart = Vue.extend({
  data: function() {
    return {
      'title': '',
      'ids': [],
      'height': 0,
      'toggle': false,
      'stream': '',
      'channels': []
  }},
  template: '#chart-template',
  methods: {

    remove_chart: function() {
      for (id of this.ids) {
        charts[id].stop();
        delete charts[id];
      }
      for (channel of this.channels) {
        series[this.stream][channel]['charts']--;
        if (series[this.stream][channel]['charts'] === 0) {
          delete series[this.stream][channel];
        }
      }
      if (Object.keys(series[this.stream]).length === 0) {
        delete series[this.stream];
        io.unsubscribe(this.stream);
      }
      this.$el.parentNode.removeChild(this.$el);
      this.$destroy();
    }

  }
});


var app = new Vue({
  el: '#app',
  data: {
    connected: false,
    selected_stream: undefined,
    selected_channel: undefined,
    selected_event: undefined,
    event_data: undefined,
    events: [ 'start', 'stop', 'pause', 'resume', 'observation'],
    streams: {}
  },
  methods: {

    add_chart: function() {

      // Get stream and channels
      stream = this.selected_stream;
      combine = this.selected_channel == 'all_combine' ? true : false;
      append = this.selected_channel == 'all_append' ? true : false;
      if (combine || append) {
        channels = this.streams[stream];
      } else {
        channels = [this.selected_channel];
      }

      this.add_chart_with_params(stream, channels, combine, append, null, null, last_millis_per_pixel);
    },

    add_chart_with_params: function(stream, channels, combine, append, title_text, subtitle_text, millis_per_pixel) {

      // Create time series if necessary
      if (series[stream] === undefined) {
        series[stream] = {};
      }
      for (channel of channels) {
        if (series[stream][channel] === undefined) {
          series[stream][channel] = {
            'instance': new TimeSeries(),
            'charts': 0,
          };
        }
        series[stream][channel]['charts']++;
      }

      // Subscribe to stream
      io.subscribe(stream);

      // Unique ID for this chart
      id = Math.random().toString(36).substr(2, 9) + '_' + stream;

      // Append chart component
      var chart = new Chart();
      chart.stream = stream;
      chart.channels = channels;
      if(title_text == null){
        chart.title = stream;
      }
      else{
        chart.title = title_text
      }
      if (append) {
        chart.height = 50;
        for (channel of channels) {
          chart.ids.push(id + '_' + channel);
        }
      } else {
        chart.height = 100;
        chart.ids.push(id);
      }
      chart.$mount();
      this.$refs.main.insertBefore(chart.$el, this.$refs.controller)

      // Create charts and bind series
      if (append) {
        for (channel of channels) {
          create_chart(id + '_' + channel, stream, [channel], 'light', subtitle_text, millis_per_pixel);
        }
      } else {
        create_chart(id, stream, channels, 'light', subtitle_text, millis_per_pixel);
      }
      last_millis_per_pixel = millis_per_pixel;
    },

    send_event: function() {
      if (this.selected_event) {
        io.event(this.selected_event, this.event_data);
      }

    },

    set_millis_per_pixel: function(value){
        last_millis_per_pixel = value;
        for (const [id, chart] of Object.entries(charts)) {
          chart.setMillisPerPixel(value);
        }
    }

  }
})


function create_chart(id, stream, channels, theme, subtitle_text, millis_per_pixel) {
  themes = {
    'dark': {
      'background': 'rgb(54, 54, 54)',
      'foreground': 'white',
      'grid': '#dbdbdb'
    },
    'light': {
      'background': 'white',
      'foreground': 'black',
      'grid': '#dbdbdb'
    }
  }

  if(subtitle_text == null){
    subtitle_text = channels.length == 1 ? channels[0] : ''
  }

  options = {
    maxValueScale: 1.2,
    minValueScale: 1.2,
    grid: {
      strokeStyle: themes[theme]['grid'],
      fillStyle: themes[theme]['background'],
      sharpLines: true,
      borderVisible: false
    },
    responsive: true,
    millisPerPixel: millis_per_pixel,
    limitFPS: 50,
    labels: {
      fillStyle: themes[theme].foreground
    },
    title: {
      fillStyle: themes[theme].foreground,
      text: subtitle_text,
      fontSize: 21,
      verticalAlign: 'top'
    },
    interpolation: 'bezier'
  };
  charts[id] = new SmoothieChart(options);
  charts[id].streamTo(document.getElementById(id), 100);
  for (channel of channels) {
    charts[id].addTimeSeries(series[stream][channel]['instance'], { strokeStyle: themes[theme]['foreground'], lineWidth: 2 });
  }
}

function update_series(payload) {
  if (series[payload.name] !== undefined) {
    for (const timestamp of Object.keys(payload.data)) {
      for (const channel of Object.keys(payload.data[timestamp])) {
        if (series[payload.name][channel] !== undefined) {
          series[payload.name][channel]['instance'].append(timestamp, payload.data[timestamp][channel]);
        }
      }
    }
  }
}

io.on('connect', function() {
  app.connected = true;
});

io.on('disconnect', function() {
  app.connected = false;
});

io.on('stream', function(payload){
  update_series(payload);
});

io.on('streams', function(payload) {
  app.streams = payload;
});
