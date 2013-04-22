/*global d3, define */

define(function (require) {

  var validator        = require('common/validator'),
      serialize        = require('common/serialize'),
      metadata         = require('md2d/models/metadata'),
      aminoacidsHelper = require('cs!md2d/models/aminoacids-helper'),

      ValidationError = validator.ValidationError;


  return function GeneticProperties() {
    var api,
        changePreHook,
        changePostHook,
        data,

        dispatch = d3.dispatch("change", "separateDNA", "transcribeStep", "playIntro"),

        calculateComplementarySequence = function () {
          // A-T (A-U)
          // G-C
          // T-A (U-A)
          // C-G

          // Use lower case during conversion to
          // avoid situation when you change A->T,
          // and later T->A again.
          var compSeq = data.DNA
            .replace(/A/g, "t")
            .replace(/G/g, "c")
            .replace(/T/g, "a")
            .replace(/C/g, "g");

          data.DNAComplement = compSeq.toUpperCase();
        },

        mRNAComplete = function () {
          // mRNA should be defined and its length should be equal to DNA length.
          return data.mRNA && data.mRNA.length === data.DNA.length;
        },

        mRNACode = function (index) {
          if (index >= data.DNAComplement.length) {
            // No more DNA to transcribe, return null.
            return null;
          }
          switch (data.DNAComplement[index]) {
            case "A": return "U";
            case "G": return "C";
            case "T": return "A";
            case "C": return "G";
          }
        },

        customValidate = function (props) {
          if (props.DNA) {
            // Allow user to use both lower and upper case.
            props.DNA = props.DNA.toUpperCase();

            if (props.DNA.search(/[^AGTC]/) !== -1) {
              // Character other than A, G, T or C is found.
              throw new ValidationError("DNA", "DNA code on sense strand can be defined using only A, G, T or C characters.");
            }
          }
          return props;
        },

        create = function (props) {
          changePreHook();

          // Note that validator always returns a copy of the input object, so we can use it safely.
          props = validator.validateCompleteness(metadata.geneticProperties, props);
          props = customValidate(props);

          // Note that validator always returns a copy of the input object, so we can use it safely.
          data = props;
          calculateComplementarySequence();

          changePostHook();
          dispatch.change();
        },

        update = function (props) {
          var key;

          changePreHook();

          // Validate and update properties.
          props = validator.validate(metadata.geneticProperties, props);
          props = customValidate(props);

          for (key in props) {
            if (props.hasOwnProperty(key)) {
              data[key] = props[key];
            }
          }

          if (props.DNA) {
            // New DNA code specified, update related properties.
            // 1. DNA complementary sequence.
            calculateComplementarySequence();
            // 2. mRNA is no longer valid. Do not recalculate it automatically
            //    (transribeDNA method should be used).
            delete data.mRNA;
            // 3. Any translation in progress should be reseted.
            delete data.translationStep;
          }

          changePostHook();
          dispatch.change();
        };

    // Public API.
    api = {
      registerChangeHooks: function (newChangePreHook, newChangePostHook) {
        changePreHook = newChangePreHook;
        changePostHook = newChangePostHook;
      },

      // Sets (updates) genetic properties.
      set: function (props) {
        if (data === undefined) {
          // Use other method of validation, ensure that the data hash is complete.
          create(props);
        } else {
          // Just update existing genetic properties.
          update(props);
        }
      },

      // Returns genetic properties.
      get: function () {
        return data;
      },

      // Deserializes genetic properties.
      deserialize: function (props) {
        create(props);
      },

      // Serializes genetic properties.
      serialize: function () {
        return data ? serialize(metadata.geneticProperties, data) : undefined;
      },

      // Convenient method for validation. It doesn't throw an exception,
      // instead a special object with validation status is returned. It can
      // be especially useful for UI classes to avoid try-catch sequences with
      // "set". The returned status object always has a "valid" property,
      // which contains result of the validation. When validation fails, also
      // "errors" hash is provided which keeps error for property causing
      // problems.
      // e.g. {
      //   valid: false,
      //   errors: {
      //     DNA: "DNA code on sense strand can be defined using only A, G, T or C characters."
      //   }
      // }
      validate: function (props) {
        var status = {
          valid: true
        };
        try {
          // Validation based on metamodel definition.
          props = validator.validate(metadata.geneticProperties, props);
          // Custom validation.
          customValidate(props);
        } catch (e) {
          status.valid = false;
          status.errors = {};
          status.errors[e.prop] = e.message;
        }
        return status;
      },

      on: function(type, listener) {
        dispatch.on(type, listener);
      },

      /**
       * Plays intro, which shows broader context of the DNA transcription and
       * translation.
       */
      playIntro: function () {
        dispatch.playIntro();
      },

      /**
       * Triggers separation of the DNA strands.
       */
      separateDNA: function () {
        if (typeof data.mRNA === "undefined") {
          changePreHook();
          data.mRNA = "";
          changePostHook();
          dispatch.separateDNA();
        }
      },

      /**
       * Triggers *complete* transcription of the DNA.
       */
      transcribe: function() {
        while (!mRNAComplete()) {
          api.transcribeStep();
        }
      },

      /**
       * Triggers only one step of DNA transcription.
       * This method also accepts optional parameter - expected nucleotide.
       * When it's available, transcription step will be performed only
       * when passed nucleotide code matches nucleotide, which should
       * be actually joined to mRNA in this transcription step. When
       * expected nucleotide code is wrong, this method does nothing.
       *
       * e.g.
       * transcribeStep("A") will perform transcription step only
       * if "A" nucleotide should be added to mRNA in this step.
       *
       * @param  {string} expectedNucleotide code of the expected nucleotide ("U", "C", "A" or "G").
       */
      transcribeStep: function (expectedNucleotide) {
        var newCode;
        if (typeof data.mRNA === 'undefined') {
          api.separateDNA();
          return;
        }

        newCode = mRNACode(data.mRNA.length);

        if (expectedNucleotide && expectedNucleotide.toUpperCase() !== newCode) {
          // Expected nucleotide is wrong, so simply do nothing.
          return;
        }

        // Check if new code is different from null.
        if (newCode) {
          changePreHook();
          data.mRNA += newCode;
          changePostHook();
          dispatch.transcribeStep();
        }
      },

      // Translates mRNA into amino acids chain.
      translate: function() {
        var result = [],
            mRNA, abbr, i, len;

        // Make sure that complete mRNA is available.
        if (!mRNAComplete()) {
          api.transcribe();
        }
        mRNA = data.mRNA;

        for (i = 0, len = mRNA.length; i + 3 <= len; i += 3) {
          abbr = aminoacidsHelper.codonToAbbr(mRNA.substr(i, 3));
          if (abbr === "STOP" || abbr === undefined) {
            return result;
          }
          result.push(abbr);
        }

        return result;
      },

      translateStepByStep: function() {
        var aaSequence, aaAbbr;

        changePreHook();

        aaSequence = api.translate();
        if (data.translationStep === undefined) {
          data.translationStep = 0;
        } else {
          data.translationStep += 1;
        }
        aaAbbr = aaSequence[data.translationStep];
        if (aaAbbr === undefined) {
          data.translationStep = "end";
        }
        changePostHook();
        dispatch.change();

        return aaAbbr;
      }
    };

    return api;
  };

});