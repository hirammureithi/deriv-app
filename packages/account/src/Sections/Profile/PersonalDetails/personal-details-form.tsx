import { ChangeEvent, Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router';
import clsx from 'clsx';
import { Form, Formik, FormikHelpers } from 'formik';

import { useInvalidateQuery } from '@deriv/api';
import { GetFinancialAssessmentResponse } from '@deriv/api-types';
import {
    Button,
    Checkbox,
    FormSubmitErrorMessage,
    HintBox,
    Input,
    Loading,
    OpenLiveChatLink,
    Text,
} from '@deriv/components';
import {
    useGetPhoneNumberList,
    useGrowthbookGetFeatureValue,
    useIsPhoneNumberVerified,
    usePhoneNumberVerificationSetTimer,
    useResidenceList,
    useStatesList,
    useTinValidations,
} from '@deriv/hooks';
import { AUTH_STATUS_CODES, getBrandWebsiteName, routes, WS } from '@deriv/shared';
import { observer, useStore } from '@deriv/stores';
import { Localize, localize } from '@deriv/translations';
import { Chat } from '@deriv/utils';
import { useDevice } from '@deriv-com/ui';

import FormBody from '../../../Components/form-body';
import FormFooter from '../../../Components/form-footer';
import FormSubHeader from '../../../Components/form-sub-header';
import { DateOfBirthField } from '../../../Components/forms/form-fields';
import AccountOpeningReasonField from '../../../Components/forms/form-fields/account-opening-reason';
import FormSelectField from '../../../Components/forms/form-select-field';
import LeaveConfirm from '../../../Components/leave-confirm';
import LoadErrorMessage from '../../../Components/load-error-message';
import POAAddressMismatchHintBox from '../../../Components/poa-address-mismatch-hint-box';
import EmploymentTaxDetailsContainer from '../../../Containers/employment-tax-details-container';
import { isFieldImmutable } from '../../../Helpers/utils';
import { useScrollElementToTop } from '../../../hooks';
import { PersonalDetailsValueTypes } from '../../../Types';

import { account_opening_reason_list, account_opening_reason_new_list } from './constants';
import InputGroup from './input-group';
import { getPersonalDetailsInitialValues, getPersonalDetailsValidationSchema, makeSettingsRequest } from './validation';
import { VerifyButton } from './verify-button';

import './personal-details-form.scss';

type TRestState = {
    show_form: boolean;
    api_error?: string;
};

const PersonalDetailsForm = observer(() => {
    const { isDesktop } = useDevice();
    const [is_loading, setIsLoading] = useState(false);
    const [is_btn_loading, setIsBtnLoading] = useState(false);
    const [is_submit_success, setIsSubmitSuccess] = useState(false);
    const invalidate = useInvalidateQuery();
    const history = useHistory();
    const versionRef = useRef('');
    const [isPhoneNumberVerificationEnabled, isPhoneNumberVerificationLoaded] = useGrowthbookGetFeatureValue({
        featureFlag: 'phone_number_verification',
    });
    const [isCountryCodeDropdownEnabled, isCountryCodeLoaded] = useGrowthbookGetFeatureValue({
        featureFlag: 'enable_country_code_dropdown',
    });

    const [isDynamicFAEnabled, isDynamicFALoaded] = useGrowthbookGetFeatureValue({
        featureFlag: 'redirect_to_fa_in_account_os',
    });

    const { next_email_otp_request_timer, is_email_otp_timer_loading } = usePhoneNumberVerificationSetTimer();

    const { tin_validation_config, mutate } = useTinValidations();

    const scrollToTop = useScrollElementToTop();

    const {
        client,
        ui,
        notifications,
        common: { is_language_changing },
    } = useStore();
    const { is_phone_number_verified } = useIsPhoneNumberVerified();

    const {
        account_settings,
        account_status,
        authentication_status,
        is_virtual,
        current_landing_company,
        updateAccountStatus,
        fetchAccountSettings,
        residence,
        is_svg,
        is_mf_account,
    } = client;

    const { field_ref_to_focus, setFieldRefToFocus } = ui;

    const { data: residence_list, isLoading: is_loading_residence_list } = useResidenceList();

    const {
        is_global_sms_available,
        is_global_whatsapp_available,
        legacy_core_countries_list,
        selected_phone_code,
        selected_country_list,
        updatePhoneSettings,
    } = useGetPhoneNumberList();

    const { data: states_list, isLoading: is_loading_state_list } = useStatesList(residence);

    const account_opening_reason_list_array = account_opening_reason_list();

    const account_opening_reason_new_list_array = account_opening_reason_new_list();
    useEffect(() => {
        if (isDynamicFAEnabled) {
            WS.authorized.storage
                .getFinancialAssessment()
                .then((data: GetFinancialAssessmentResponse) => {
                    if (data?.get_financial_assessment) {
                        // @ts-expect-error new key not updated in api types
                        versionRef.current = data.get_financial_assessment.financial_information_version ?? '';
                    }
                })
                .catch((error: unknown) => {
                    // eslint-disable-next-line no-console
                    console.error('Error fetching financial assessment:', error);
                });
        }
    }, [isDynamicFAEnabled]);

    const {
        refreshNotifications,
        showPOAAddressMismatchSuccessNotification,
        showPOAAddressMismatchFailureNotification,
    } = notifications;

    const has_poa_address_mismatch = account_status?.status?.includes('poa_address_mismatch');
    const should_update_fa = account_status?.status?.includes('update_fa');
    const [rest_state, setRestState] = useState<TRestState>({
        show_form: true,
    });

    const notification_timeout = useRef<NodeJS.Timeout>();
    const scroll_div_ref = useRef(null);

    const [start_on_submit_timeout, setStartOnSubmitTimeout] = useState<{
        is_timeout_started: boolean;
        timeout_callback: () => void;
    }>({
        is_timeout_started: false,
        timeout_callback: () => null,
    });

    useEffect(() => {
        fetchAccountSettings();
    }, [fetchAccountSettings]);

    const should_show_loader =
        is_loading_state_list ||
        is_loading ||
        is_loading_residence_list ||
        !isPhoneNumberVerificationLoaded ||
        !isCountryCodeLoaded ||
        !isDynamicFALoaded;

    useEffect(() => {
        const init = async () => {
            try {
                // Order of API calls is important
                await WS.wait('get_settings');
                await invalidate('residence_list');
                await invalidate('states_list');
            } finally {
                setIsLoading(false);
            }
        };
        if (is_language_changing) {
            setIsLoading(true);
            init();
        }
    }, [invalidate, is_language_changing]);

    const checkForInitialCarriersSupported = () => {
        const is_sms_carrier_available =
            selected_country_list?.carriers &&
            (selected_country_list?.carriers as string[]).includes('sms') &&
            is_global_sms_available;

        const is_whatsapp_carrier_available =
            selected_country_list?.carriers &&
            (selected_country_list?.carriers as string[]).includes('whatsapp') &&
            is_global_whatsapp_available;

        return is_sms_carrier_available || is_whatsapp_carrier_available;
    };

    const hintMessage = () => {
        if (isPhoneNumberVerificationEnabled) {
            if (is_phone_number_verified) {
                return (
                    <Localize
                        i18n_default_text='To change your verified phone number, contact us via <0>live chat</0>.'
                        components={[
                            <span
                                className='account-form__fieldset--phone-verification-livechat-link'
                                key={0}
                                onClick={Chat.open}
                            />,
                        ]}
                    />
                );
            }
        } else {
            return null;
        }
    };

    const onSubmit = async (
        values: PersonalDetailsValueTypes,
        { setStatus, setSubmitting }: FormikHelpers<PersonalDetailsValueTypes>
    ) => {
        setStatus({ msg: '' });
        const request = {
            ...makeSettingsRequest({ ...values }, residence_list, states_list, is_virtual),
            ...(isDynamicFAEnabled && {
                financial_information_version: should_update_fa ? 'v2' : versionRef.current || 'v2',
            }),
        };
        setIsBtnLoading(true);
        const data = await WS.authorized.setSettings(request);

        if (data.error) {
            setStatus({ msg: data.error.message, code: data.error.code });
            setIsBtnLoading(false);
            setSubmitting(false);
        } else {
            // Adding a delay to show the notification after the page reload
            notification_timeout.current = setTimeout(() => {
                if (data.set_settings.notification) {
                    showPOAAddressMismatchSuccessNotification();
                } else if (has_poa_address_mismatch) {
                    showPOAAddressMismatchFailureNotification();
                }
            }, 2000);

            // force request to update settings cache since settings have been updated
            const response = await WS.authorized.storage.getSettings();
            if (response.error) {
                setRestState(prev_state => ({ ...prev_state, api_error: response.error.message }));
                return;
            }
            // Fetches the status of the account after update
            updatePhoneSettings();
            updateAccountStatus();
            refreshNotifications();
            setIsBtnLoading(false);
            setIsSubmitSuccess(true);
            setStartOnSubmitTimeout({
                is_timeout_started: true,
                timeout_callback: () => {
                    setSubmitting(false);
                },
            });
            // redirection back based on 'from' param in query string
            const url_query_string = window.location.search;
            const url_params = new URLSearchParams(url_query_string);
            if (url_params.get('from')) {
                const from = url_params.get('from') as keyof typeof routes;
                history.push(routes[from]);
            }
        }
    };

    useEffect(() => () => clearTimeout(notification_timeout.current), []);

    useEffect(() => {
        let timeout_id: NodeJS.Timeout;
        if (start_on_submit_timeout.is_timeout_started) {
            timeout_id = setTimeout(() => {
                setIsSubmitSuccess(false);
                setStartOnSubmitTimeout({
                    is_timeout_started: false,
                    timeout_callback: () => setIsSubmitSuccess(false),
                });
            }, 3000);
        }

        return () => {
            clearTimeout(timeout_id);
        };
    }, [start_on_submit_timeout.is_timeout_started]);

    const showForm = (show_form: boolean) => setRestState({ show_form });

    const isFieldDisabled = (name: string): boolean => {
        return !!account_settings?.immutable_fields?.includes(name);
    };

    const employment_tax_editable_fields = useMemo(() => {
        const fields_to_disable = ['employment_status', 'tax_identification_number'].filter(field =>
            isFieldImmutable(field, account_settings?.immutable_fields)
        );
        /*
            [TODO]: Will be removed once BE enables tax_residence in immutable_fields
            If Tax_residence value is present in response, then it must not be editable
        */
        if (!account_settings?.tax_residence) {
            fields_to_disable.push('tax_residence');
        }
        return fields_to_disable;
    }, [account_settings?.immutable_fields, account_settings?.tax_residence]);

    const { api_error, show_form } = rest_state;
    const loadTimer = useRef<NodeJS.Timeout>();

    // To facilitate scrolling to the field that is to be focused
    useLayoutEffect(() => {
        if (field_ref_to_focus && !should_show_loader && !api_error) {
            loadTimer.current = setTimeout(() => {
                const parentRef = isDesktop
                    ? document.querySelector('.account-form__personal-details .dc-themed-scrollbars')
                    : document.querySelector('.account__scrollbars_container--grid-layout');
                const targetRef = document.getElementById(field_ref_to_focus) as HTMLElement;
                const offset = 24; // 24 is the padding of the container
                scrollToTop(parentRef as HTMLElement, targetRef, offset);
            }, 0);
        }
        return () => {
            if (field_ref_to_focus) {
                clearTimeout(loadTimer.current);
            }
        };
    }, [field_ref_to_focus, isDesktop, should_show_loader, api_error, scrollToTop, setFieldRefToFocus]);

    useEffect(() => {
        return () => {
            setFieldRefToFocus(null);
        };
    }, [setFieldRefToFocus]);

    if (api_error) return <LoadErrorMessage error_message={api_error} />;

    if (should_show_loader) {
        return <Loading is_fullscreen={false} className='account__initial-loader' />;
    }

    const is_poa_verified = authentication_status?.document_status === AUTH_STATUS_CODES.VERIFIED;
    const is_poi_verified = authentication_status?.identity_status === AUTH_STATUS_CODES.VERIFIED;

    const is_account_verified = is_poa_verified && is_poi_verified;

    const stripped_phone_number = isCountryCodeDropdownEnabled
        ? account_settings.phone?.replace(/\D/g, '')
        : `+${account_settings.phone?.replace(/\D/g, '')}`;

    //Generate Redirection Link to user based on verification status
    const getRedirectionLink = () => {
        if (!is_poi_verified) {
            return '/account/proof-of-identity';
        } else if (!is_poa_verified) {
            return '/account/proof-of-address';
        }
        return undefined;
    };

    const is_tin_auto_set = Boolean(account_settings?.tin_skipped);

    const is_employment_status_tin_mandatory = Boolean(account_status?.status?.includes('mt5_additional_kyc_required'));

    const PersonalDetailSchema = getPersonalDetailsValidationSchema(
        is_virtual,
        is_svg,
        tin_validation_config,
        is_tin_auto_set,
        account_settings?.immutable_fields,
        is_employment_status_tin_mandatory,
        isCountryCodeDropdownEnabled
    );
    const displayErrorMessage = (status: { code: string; msg: string }) => {
        if (status?.code === 'PhoneNumberTaken') {
            return (
                <FormSubmitErrorMessage
                    message={
                        <Localize
                            i18n_default_text='Number already exists in our system. Enter a new one or contact us via <0></0> for help'
                            components={[<OpenLiveChatLink text_size='xxs' key={0} />]}
                        />
                    }
                    text_color='loss-danger'
                    weight='none'
                />
            );
        }
        return <FormSubmitErrorMessage message={status?.msg} />;
    };

    const initialValues = getPersonalDetailsInitialValues(
        {
            ...account_settings,
            employment_status:
                should_update_fa && versionRef.current === 'v1' ? undefined : account_settings.employment_status,
        },
        residence_list,
        states_list,
        is_virtual,
        selected_phone_code,
        checkForInitialCarriersSupported(),
        isCountryCodeDropdownEnabled
    );

    const getAccountOpeningReason = () => {
        const result = account_opening_reason_new_list_array.find(
            item => item.value === initialValues?.account_opening_reason
        );

        if (result) return account_opening_reason_new_list_array;

        const item = account_opening_reason_list_array.find(
            item => item.value === initialValues?.account_opening_reason
        );

        return item ? [item, ...account_opening_reason_new_list_array] : account_opening_reason_new_list_array;
    };

    return (
        <Formik
            initialValues={initialValues}
            enableReinitialize
            onSubmit={onSubmit}
            validationSchema={PersonalDetailSchema}
        >
            {({
                values,
                errors,
                setStatus,
                status,
                handleChange,
                handleBlur,
                handleSubmit,
                isSubmitting,
                isValid,
                setFieldValue,
                setFieldTouched,
                dirty,
            }) => (
                <Fragment>
                    <LeaveConfirm onDirty={isDesktop ? undefined : showForm} />
                    {show_form && (
                        <Form
                            noValidate
                            className='account-form account-form__personal-details'
                            onSubmit={handleSubmit}
                            data-testid='dt_account_personal_details_section'
                        >
                            <FormBody scroll_offset={isDesktop ? '80px' : '199px'}>
                                <FormSubHeader title={localize('Details')} />
                                {!is_virtual && (
                                    <Fragment>
                                        {isDesktop ? (
                                            <InputGroup className='account-form__fieldset--2-cols'>
                                                <Input
                                                    data-lpignore='true'
                                                    type='text'
                                                    name='first_name'
                                                    label={localize('First name*')}
                                                    value={values.first_name}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    required
                                                    disabled={isFieldDisabled('first_name')}
                                                    error={errors.first_name}
                                                    id='first_name'
                                                    data-testid='dt_first_name'
                                                />
                                                <Input
                                                    id='last_name'
                                                    data-lpignore='true'
                                                    type='text'
                                                    name='last_name'
                                                    label={localize('Last name*')}
                                                    value={values.last_name}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    required
                                                    disabled={isFieldDisabled('last_name')}
                                                    error={errors.last_name}
                                                    data-testid='dt_last_name'
                                                />
                                            </InputGroup>
                                        ) : (
                                            <Fragment>
                                                <fieldset className='account-form__fieldset'>
                                                    <Input
                                                        data-lpignore='true'
                                                        type='text'
                                                        name='first_name'
                                                        id='first_name_mobile'
                                                        label={localize('First name*')}
                                                        value={values.first_name}
                                                        onChange={handleChange}
                                                        onBlur={handleBlur}
                                                        required
                                                        disabled={isFieldDisabled('first_name')}
                                                        error={errors.first_name}
                                                        data-testid='dt_first_name'
                                                    />
                                                </fieldset>
                                                <fieldset className='account-form__fieldset'>
                                                    <Input
                                                        data-lpignore='true'
                                                        type='text'
                                                        name='last_name'
                                                        id='last_name_mobile'
                                                        label={localize('Last name*')}
                                                        value={values.last_name}
                                                        onChange={handleChange}
                                                        onBlur={handleBlur}
                                                        required
                                                        disabled={isFieldDisabled('last_name')}
                                                        error={errors.last_name}
                                                        data-testid='dt_last_name'
                                                    />
                                                </fieldset>
                                            </Fragment>
                                        )}
                                        {'place_of_birth' in values && (
                                            <fieldset className='account-form__fieldset'>
                                                <FormSelectField
                                                    label={localize('Place of birth')}
                                                    name='place_of_birth'
                                                    list_items={residence_list}
                                                    disabled={isFieldDisabled('place_of_birth')}
                                                />
                                            </fieldset>
                                        )}
                                        <fieldset className='account-form__fieldset'>
                                            <DateOfBirthField
                                                name='date_of_birth'
                                                label={localize('Date of birth*')}
                                                id='birth_day'
                                                disabled={isFieldDisabled('date_of_birth')}
                                                portal_id=''
                                                // @ts-expect-error this type value needs to be check again in GetSettings
                                                value={values.date_of_birth}
                                            />
                                        </fieldset>

                                        <fieldset className='account-form__fieldset'>
                                            <FormSelectField
                                                label={localize('Citizenship*')}
                                                name='citizen'
                                                list_items={residence_list}
                                                disabled={isFieldDisabled('citizen')}
                                            />
                                        </fieldset>
                                    </Fragment>
                                )}
                                <fieldset className='account-form__fieldset'>
                                    <Input
                                        data-lpignore='true'
                                        type='text'
                                        name='residence'
                                        id={'residence'}
                                        label={localize('Country of residence*')}
                                        //@ts-expect-error type of residence should not be null: needs to be updated in GetSettings type
                                        value={values.residence}
                                        required
                                        disabled={isFieldDisabled('residence')}
                                        error={errors.residence}
                                        onChange={handleChange}
                                    />
                                </fieldset>
                                {!is_virtual && (
                                    <Fragment>
                                        <fieldset className='account-form__fieldset'>
                                            <div
                                                className={clsx('account-form__fieldset--phone_container', {
                                                    'account-form__fieldset--phone_container--verified':
                                                        is_phone_number_verified,
                                                    'account-form__fieldset--phone_container--with-1-field':
                                                        !isCountryCodeDropdownEnabled,
                                                })}
                                            >
                                                <div className='account-form__fieldset--phone_input'>
                                                    {isCountryCodeDropdownEnabled && (
                                                        <FormSelectField
                                                            label={localize('Code*')}
                                                            name='calling_country_code'
                                                            list_items={legacy_core_countries_list}
                                                            is_country_code_dropdown
                                                            onItemSelection={country_list => {
                                                                setFieldValue(
                                                                    'calling_country_code',
                                                                    country_list.value,
                                                                    true
                                                                );
                                                                const is_sms_carrier_available =
                                                                    //@ts-expect-error carriers is not defined in TListItem type
                                                                    country_list.carriers &&
                                                                    //@ts-expect-error carriers is not defined in TListItem type
                                                                    (country_list.carriers as string[]).includes(
                                                                        'sms'
                                                                    ) &&
                                                                    is_global_sms_available;
                                                                const is_whatsapp_carrier_available =
                                                                    //@ts-expect-error carriers is not defined in TListItem type
                                                                    country_list.carriers &&
                                                                    //@ts-expect-error carriers is not defined in TListItem type
                                                                    (country_list.carriers as string[]).includes(
                                                                        'whatsapp'
                                                                    ) &&
                                                                    is_global_whatsapp_available;
                                                                setFieldValue(
                                                                    'is_carriers_available',
                                                                    is_sms_carrier_available ||
                                                                        is_whatsapp_carrier_available,
                                                                    true
                                                                );
                                                            }}
                                                            disabled={
                                                                isFieldDisabled('calling_country_code') ||
                                                                !!next_email_otp_request_timer ||
                                                                is_email_otp_timer_loading
                                                            }
                                                        />
                                                    )}
                                                    <Input
                                                        data-lpignore='true'
                                                        type='text'
                                                        inputMode='numeric'
                                                        name='phone'
                                                        id={'phone'}
                                                        label={localize('Phone number*')}
                                                        //@ts-expect-error type of residence should not be null: needs to be updated in GetSettings type
                                                        value={values.phone}
                                                        className='account-form__fieldset--phone-number-input'
                                                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                                            let phone_number = e.target.value.replace(/\D/g, '');
                                                            if (!isCountryCodeDropdownEnabled) {
                                                                phone_number =
                                                                    phone_number.length === 0
                                                                        ? '+'
                                                                        : `+${phone_number}`;
                                                            }
                                                            setFieldValue('phone', phone_number, true);
                                                            setStatus('');
                                                        }}
                                                        onBlur={handleBlur}
                                                        required
                                                        error={errors.phone}
                                                        disabled={
                                                            isFieldDisabled('phone') ||
                                                            !!next_email_otp_request_timer ||
                                                            is_email_otp_timer_loading
                                                        }
                                                        data-testid='dt_phone'
                                                    />
                                                </div>
                                                {isPhoneNumberVerificationEnabled && (
                                                    <VerifyButton
                                                        is_dynamic_fa_enabled={isDynamicFAEnabled}
                                                        is_verify_button_disabled={
                                                            isFieldDisabled('phone') ||
                                                            !isValid ||
                                                            !stripped_phone_number ||
                                                            is_email_otp_timer_loading ||
                                                            (isCountryCodeDropdownEnabled &&
                                                                //@ts-expect-error is_carriers_available is not defined in GetSettings type
                                                                !values.is_carriers_available)
                                                        }
                                                        // @ts-expect-error This needs to fixed in VerifyButton component
                                                        values={values}
                                                        residence_list={residence_list}
                                                        states_list={states_list}
                                                        next_email_otp_request_timer={next_email_otp_request_timer}
                                                        setStatus={setStatus}
                                                        version={
                                                            should_update_fa && versionRef.current === 'v1'
                                                                ? 'v2'
                                                                : versionRef.current
                                                        }
                                                    />
                                                )}
                                            </div>
                                            {is_phone_number_verified && (
                                                <div className='account-form__fieldset--phone_container--verified-hint'>
                                                    <Text as='p' color='less-prominent' size='xxs'>
                                                        {hintMessage()}
                                                    </Text>
                                                </div>
                                            )}
                                        </fieldset>
                                        <AccountOpeningReasonField
                                            account_opening_reason_list={getAccountOpeningReason()}
                                            setFieldValue={setFieldValue}
                                            disabled={isFieldDisabled('account_opening_reason')}
                                            required
                                            fieldFocused={
                                                !account_settings.account_opening_reason &&
                                                field_ref_to_focus === 'account-opening-reason'
                                            }
                                        />
                                    </Fragment>
                                )}
                                {!is_virtual && (
                                    <div className='employment-tin-section'>
                                        <FormSubHeader title={localize('Employment and tax information')} />
                                        <EmploymentTaxDetailsContainer
                                            editable_fields={employment_tax_editable_fields}
                                            parent_ref={scroll_div_ref}
                                            handleChange={mutate}
                                            tin_validation_config={tin_validation_config}
                                            should_display_long_message={is_mf_account}
                                            should_focus_fields={field_ref_to_focus === 'employment-tax-section'}
                                            version={should_update_fa ? 'v2' : versionRef.current}
                                            is_feature_flag_disabled={isDynamicFALoaded && !isDynamicFAEnabled}
                                        />
                                        {has_poa_address_mismatch && <POAAddressMismatchHintBox />}
                                        <FormSubHeader title={localize('Address')} />
                                        <div className='account-address__details-section'>
                                            <fieldset className='account-form__fieldset'>
                                                <Input
                                                    data-lpignore='true'
                                                    autoComplete='off' // prevent chrome autocomplete
                                                    type='text'
                                                    maxLength={70}
                                                    name='address_line_1'
                                                    id='address_line_1'
                                                    label={localize('First line of address*')}
                                                    value={values.address_line_1}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    error={errors.address_line_1}
                                                    required
                                                    disabled={isFieldDisabled('address_line_1')}
                                                    data-testid='dt_address_line_1'
                                                />
                                            </fieldset>
                                            <fieldset className='account-form__fieldset'>
                                                <Input
                                                    data-lpignore='true'
                                                    autoComplete='off' // prevent chrome autocomplete
                                                    type='text'
                                                    maxLength={70}
                                                    name='address_line_2'
                                                    id='address_line_2'
                                                    label={localize('Second line of address (optional)')}
                                                    value={values.address_line_2}
                                                    error={errors.address_line_2}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    required
                                                    disabled={isFieldDisabled('address_line_2')}
                                                />
                                            </fieldset>
                                            <fieldset className='account-form__fieldset'>
                                                <Input
                                                    data-lpignore='true'
                                                    autoComplete='off' // prevent chrome autocomplete
                                                    type='text'
                                                    name='address_city'
                                                    id='address_city'
                                                    label={localize('Town/City*')}
                                                    value={values.address_city}
                                                    error={errors.address_city}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    required
                                                    disabled={isFieldDisabled('address_city')}
                                                    data-testid='dt_address_city'
                                                />
                                            </fieldset>
                                            <fieldset className='account-form__fieldset'>
                                                {states_list.length ? (
                                                    <FormSelectField
                                                        label={localize('State/Province (optional)')}
                                                        name='address_state'
                                                        list_items={states_list}
                                                        disabled={isFieldDisabled('address_state')}
                                                    />
                                                ) : (
                                                    <Input
                                                        data-lpignore='true'
                                                        autoComplete='off' // prevent chrome autocomplete
                                                        type='text'
                                                        name='address_state'
                                                        id='address_state'
                                                        label={localize('State/Province (optional)')}
                                                        value={values.address_state}
                                                        error={errors.address_state}
                                                        onChange={handleChange}
                                                        onBlur={handleBlur}
                                                        disabled={isFieldDisabled('address_state')}
                                                    />
                                                )}
                                            </fieldset>
                                            <fieldset className='account-form__fieldset'>
                                                <Input
                                                    data-lpignore='true'
                                                    autoComplete='off' // prevent chrome autocomplete
                                                    type='text'
                                                    name='address_postcode'
                                                    id='address_postcode'
                                                    label={localize('Postal/ZIP code')}
                                                    value={values.address_postcode}
                                                    error={errors.address_postcode}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    disabled={isFieldDisabled('address_postcode')}
                                                />
                                            </fieldset>
                                        </div>
                                    </div>
                                )}
                                {!!current_landing_company?.support_professional_client && (
                                    <Fragment>
                                        <div className='account-form__divider' />
                                        <div className='pro-client'>
                                            <FormSubHeader title={localize('Professional Client')} />
                                            <fieldset className='account-form__fieldset'>
                                                <div>
                                                    <Text as='p' size='xs'>
                                                        <Localize
                                                            i18n_default_text='By default, all {{brand_website_name}} clients are retail clients but anyone can request to be treated as a professional client.'
                                                            values={{
                                                                brand_website_name: getBrandWebsiteName(),
                                                            }}
                                                        />
                                                    </Text>
                                                    <Text as='p' size='xs'>
                                                        <Localize i18n_default_text='A professional client receives a lower degree of client protection due to the following.' />
                                                    </Text>
                                                    <Text as='p' size='xs'>
                                                        <Localize i18n_default_text='We presume that you possess the experience, knowledge, and expertise to make your own investment decisions and properly assess the risk involved.' />
                                                    </Text>
                                                    <Text as='p' size='xs' className='last-child'>
                                                        <Localize i18n_default_text='We’re not obliged to conduct an appropriateness test, nor provide you with any risk warnings.' />
                                                    </Text>
                                                </div>
                                                {is_account_verified ? (
                                                    <Checkbox
                                                        name='request_professional_status'
                                                        value={!!values.request_professional_status}
                                                        onChange={() => {
                                                            setFieldValue(
                                                                'request_professional_status',
                                                                values.request_professional_status ? 0 : 1
                                                            );
                                                            setFieldTouched('request_professional_status', true, true);
                                                        }}
                                                        label={localize(
                                                            'I would like to be treated as a professional client.'
                                                        )}
                                                        id='request_professional_status'
                                                        disabled={
                                                            is_virtual || !!account_settings.request_professional_status
                                                        }
                                                        greyDisabled
                                                    />
                                                ) : (
                                                    <HintBox
                                                        icon='IcInfoBlue'
                                                        icon_height={20}
                                                        icon_width={30}
                                                        message={
                                                            <Text as='p' size='xs'>
                                                                <Localize
                                                                    i18n_default_text='You’ll need to authenticate your account before requesting to become a professional client. <0>Authenticate my account</0>'
                                                                    components={[
                                                                        <a
                                                                            key={0}
                                                                            className='link--no-bold'
                                                                            rel='noopener noreferrer'
                                                                            target='_blank'
                                                                            href={getRedirectionLink()}
                                                                        />,
                                                                    ]}
                                                                />
                                                            </Text>
                                                        }
                                                        is_info
                                                        is_inline
                                                    />
                                                )}
                                            </fieldset>
                                        </div>
                                        <div className='account-form__divider' />
                                    </Fragment>
                                )}
                                <FormSubHeader title={localize('Email preference')} />
                                <Fragment>
                                    <fieldset
                                        className={clsx(
                                            'account-form__fieldset',
                                            'account-form__fieldset--email-consent'
                                        )}
                                    >
                                        <Checkbox
                                            name='email_consent'
                                            value={!!values.email_consent}
                                            onChange={() => {
                                                setFieldValue('email_consent', values.email_consent ? 0 : 1);
                                                setFieldTouched('email_consent', true, true);
                                            }}
                                            label={localize('Get updates about Deriv products, services and events.')}
                                            id='email_consent'
                                            defaultChecked={!!values.email_consent}
                                            disabled={isFieldDisabled('email_consent') && !is_virtual}
                                            label_line_height={'m'}
                                        />
                                    </fieldset>
                                </Fragment>
                            </FormBody>
                            <FormFooter>
                                {status?.msg && displayErrorMessage(status)}
                                {!is_virtual && !(isSubmitting || is_submit_success || status?.msg) && (
                                    <Text
                                        className='account-form__footer-note'
                                        size='xxs'
                                        color='prominent'
                                        align={isDesktop ? 'right' : 'center'}
                                    >
                                        <Localize i18n_default_text='Ensure your information is correct.' />
                                    </Text>
                                )}
                                <Button
                                    className={clsx('account-form__footer-btn', {
                                        'dc-btn--green': is_submit_success,
                                    })}
                                    type='submit'
                                    is_disabled={
                                        isSubmitting || !dirty || !isValid || is_btn_loading || is_submit_success
                                    }
                                    has_effect
                                    is_loading={is_btn_loading}
                                    is_submit_success={is_submit_success}
                                    text={localize('Save changes')}
                                    large
                                    primary
                                />
                            </FormFooter>
                        </Form>
                    )}
                </Fragment>
            )}
        </Formik>
    );
});

export default PersonalDetailsForm;
