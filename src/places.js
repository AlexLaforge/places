import EventEmitter from 'events';

import algoliasearch from 'algoliasearch/lite.js';
import autocomplete from 'autocomplete.js';

import './navigatorLanguage.js';

import createAutocompleteDataset from './createAutocompleteDataset.js';

import clearIcon from './icons/clear.svg';
import pinIcon from './icons/address.svg';

import css from './places.scss';
import insertCss from 'insert-css';
insertCss(css, {prepend: true});

import errors from './errors.js';

export default function places(options) {
  const {
    container,
    style,
    autocompleteOptions: userAutocompleteOptions = {}
  } = options;

  // multiple DOM elements targeted
  if (container instanceof NodeList) {
    if (container.length > 1) {
      throw new Error(errors.multiContainers);
    }

    // if single node NodeList received, resolve to the first one
    return places({...options, container: container[0]});
  }

  // container sent as a string, resolve it for multiple DOM elements issue
  if (typeof container === 'string') {
    const resolvedContainer = document.querySelectorAll(container);
    return places({...options, container: resolvedContainer});
  }

  // if not an <input>, error
  if (!(container instanceof HTMLInputElement)) {
    throw new Error(errors.badContainer);
  }

  const placesInstance = new EventEmitter();
  const prefix = 'ap' + (style === false ? '-nostyle' : '');

  const autocompleteOptions = {
    autoselect: true,
    hint: false,
    cssClasses: {
      root: 'algolia-places' + (style === false ? '-nostyle' : ''),
      prefix
    },
    debug: process.env.NODE_ENV === 'development' ? true : false,
    ...userAutocompleteOptions
  };

  const autocompleteDataset = createAutocompleteDataset({
    ...options,
    algoliasearch,
    onHits: ({hits, rawAnswer, query}) => placesInstance.emit('suggestions', {
      rawAnswer,
      query,
      suggestions: hits
    }),
    onError: e => placesInstance.emit('error', e),
    onRateLimitReached: () => {
      const listeners = placesInstance.listenerCount('limit');
      if (listeners === 0) {
        console.log(errors.rateLimitReached); // eslint-disable-line
        return;
      }

      placesInstance.emit('limit', {message: errors.rateLimitReached});
    },
    container: undefined
  });

  const autocompleteInstance = autocomplete(container, autocompleteOptions, autocompleteDataset);
  const autocompleteContainer = container.parentNode;

  const autocompleteChangeEvents = ['selected', 'autocompleted'];

  autocompleteChangeEvents.forEach(eventName => {
    autocompleteInstance.on(`autocomplete:${eventName}`, (_, suggestion) => {
      placesInstance.emit('change', {
        rawAnswer: suggestion.rawAnswer,
        query: suggestion.query,
        suggestion,
        suggestionIndex: suggestion.hitIndex
      });
    });
  });
  autocompleteInstance.on('autocomplete:cursorchanged', (_, suggestion) => {
    placesInstance.emit('cursorchanged', {
      rawAnswer: suggestion.rawAnswer,
      query: suggestion.query,
      suggestion,
      suggestionIndex: suggestion.hitIndex
    });
  });

  const clear = document.createElement('button');
  clear.setAttribute('type', 'button');
  clear.classList.add(`${prefix}-input-icon`);
  clear.classList.add(`${prefix}-icon-clear`);
  clear.innerHTML = clearIcon;
  autocompleteContainer.appendChild(clear);
  clear.style.display = 'none';

  const pin = document.createElement('button');
  pin.setAttribute('type', 'button');
  pin.classList.add(`${prefix}-input-icon`);
  pin.classList.add(`${prefix}-icon-pin`);
  pin.innerHTML = pinIcon;
  autocompleteContainer.appendChild(pin);

  pin.addEventListener('click', () => autocompleteInstance.focus());
  clear.addEventListener('click', () => {
    autocompleteInstance.autocomplete.setVal('');
    autocompleteInstance.focus();
    clear.style.display = 'none';
    pin.style.display = '';
    placesInstance.emit('clear');
  });

  let previousQuery = '';

  const inputListener = () => {
    const query = autocompleteInstance.val();
    if (query === '') {
      pin.style.display = '';
      clear.style.display = 'none';
      if (previousQuery !== query) {
        placesInstance.emit('clear');
      }
    } else {
      clear.style.display = '';
      pin.style.display = 'none';
    }
    previousQuery = query;
  };

  autocompleteContainer.querySelector(`.${prefix}-input`).addEventListener('input', inputListener);

  const autocompleteMethods = ['open', 'close', 'getVal', 'setVal', 'destroy'];
  autocompleteMethods.forEach(methodName => {
    placesInstance[methodName] = () => {
      if (methodName === 'destroy') {
        // this is the only event we need to manually remove because the input will still be here
        autocompleteContainer.querySelector(`.${prefix}-input`).removeEventListener('input', inputListener);
      }
      return autocompleteInstance.autocomplete[methodName]();
    };
  });

  return placesInstance;
}
