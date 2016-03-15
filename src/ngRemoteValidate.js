( function( angular ) {
    'use strict';
    if( !angular ) {
        throw 'Missing something? Please add angular.js to your project or move this script below the angular.js reference';
    }

    var directiveId = 'ngRemoteValidate',
        remoteValidate = function( $http, $timeout, $q ) {
            return {
                restrict: 'A',
                require: [ '^form','ngModel' ],
                scope: {
                    ngRemoteInterceptors: '=?'
                },
                link: function( scope, el, attrs, ctrls ) {
                    var cache = {},
                        handleChange,
                        setValidation,
                        addToCache,
                        request,
                        shouldProcess,
                        ngForm = ctrls[ 0 ],
                        ngModel = ctrls[ 1 ],
                        options = {
                            ngRemoteThrottle: 400,
                            ngRemoteMethod: 'POST'
                        };

                    angular.extend( options, attrs );
                    //TODO: Use Cain of Responsibility to reduce complexity.
                    if( options.ngRemoteValidate.charAt( 0 ) === '[' ) {
                        options.urls = eval( options.ngRemoteValidate );
                    } else if (options.ngRemoteValidate.charAt( 0 ) === '{') {
                        options.keys = eval( '(' + options.ngRemoteValidate + ')' );
                        options.urls = Object.keys( options.keys );
                    } else {
                        options.urls = [ options.ngRemoteValidate ];
                    }

                    addToCache = function( response ) {
                        var value = response[ 0 ].data.value;
                        if ( cache[ value ] ) return cache[ value ];
                        cache[ value ] = response;
                    };

                    shouldProcess = function( value ) {
                        var otherRulesInValid = false;
                        for ( var p in ngModel.$error ) {
                            var checkedKey = !options.hasOwnProperty( 'keys' ) ||
                                             !( Object.keys(options.keys )
                                .filter( function( k ) {
                                    return options.keys[ k ] === p;
                                } )[ 0 ] );
                            if ( ngModel.$error[ p ] && p != directiveId && checkedKey ) {
                                otherRulesInValid = true;
                                break;
                            }
                        }
                        return !( ngModel.$pristine || otherRulesInValid );
                    };

                    setValidation = function( response, skipCache ) {
                        var i = 0,
                            l = response.length,
                            useKeys = options.hasOwnProperty( 'keys' ),
                            isValid = true;
                        for( ; i < l; i++ ) {

                            if( scope.ngRemoteInterceptors && scope.ngRemoteInterceptors.response ) {
                                response[ i ] = scope.ngRemoteInterceptors.response( response[ i ] );
                            }

                            if( !response[ i ].data.isValid ) {
                                isValid = false;
                                if (!useKeys) {
                                    break;
                                }
                            }

                            var canSetKey = ( useKeys &&
                                              response[ i ].hasOwnProperty( 'config' ) &&
                                              options.keys[ response[ i ].config.url ] );

                            if ( canSetKey ) {
                                var key = options.keys[ response[ i ].config.url ];
                                ngModel.$setValidity( key, response[ i ].data.isValid );
                            }

                            if( response[ i ].data.formattedValue ) {
                                ngModel.$setViewValue( response[ i ].data.formattedValue );
                                ngModel.$render( );
                            }
                        }
                        if( !skipCache ) {
                            addToCache( response );
                        }
                        ngModel.$setValidity( directiveId, isValid );
                        ngModel.$processing = ngModel.$pending = ngForm.$pending = false;
                    };

                    handleChange = function( value ) {
                        if( typeof value === 'undefined' || value === '' ) {
                            if ( request ) {
                                $timeout.cancel( request );
                             }
                            ngModel.$setPristine();
                            ngModel.$setValidity( directiveId, true);
                            if ( options.hasOwnProperty( 'keys' ) ) {
                                var i = 0,
                                    l = options.urls.length;
                                for( ; i < l; i++ ) {
                                    var key = options.keys[ options.urls[i] ];
                                    ngModel.$setValidity( key, true);
                                }
                            }
                            return;
                        }

                        if ( !shouldProcess( value ) ) {
                            return setValidation( [ { data: { isValid: true, value: value } } ], true );
                        }

                        if ( cache[ value ] ) {
                            return setValidation( cache[ value ], true );
                        }

                        //Set processing now, before the delay.
                        //Check first to reduce DOM updates
                        if( !ngModel.$pending ) {
                            ngModel.$processing = ngModel.$pending = ngForm.$pending = true;
                        }

                        if ( request ) {
                            $timeout.cancel( request );
                        }

                        request = $timeout( function( ) {
                            var calls = [],
                                i = 0,
                                l = options.urls.length,
                                toValidate = { value: value },
                                httpOpts = { method: options.ngRemoteMethod };

                            if ( scope[ el[0].name + 'SetArgs' ] ) {
                                toValidate = scope[el[0].name + 'SetArgs'](value, el, attrs, ngModel);
                            }

                            if(options.ngRemoteMethod == 'POST'){
                                httpOpts.data = toValidate;
                            } else {
                                httpOpts.params = toValidate;
                            }

                            for( ; i < l; i++ ) {
                                httpOpts.url =  options.urls[ i ];

                                if(scope.ngRemoteInterceptors && scope.ngRemoteInterceptors.request){
                                    httpOpts = scope.ngRemoteInterceptors.request(httpOpts);
                                }

                                calls.push( $http( httpOpts ) );
                            }

                            $q.all( calls ).then( setValidation );

                        }, options.ngRemoteThrottle );
                        return true;
                    };

                    //ngModel.$parsers.unshift( handleChange );
                    scope.$watch( function( ) {
                        return ngModel.$viewValue;
                    }, handleChange );
                }
            };
        };

    angular.module( 'remoteValidation', [] )
           .constant('MODULE_VERSION', '##_version_##')
           .directive( directiveId, [ '$http', '$timeout', '$q', remoteValidate ] );

})( this.angular );
